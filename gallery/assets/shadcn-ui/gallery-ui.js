function qw(n, r) {
  for (var a = 0; a < r.length; a++) {
    const i = r[a];
    if (typeof i != "string" && !Array.isArray(i)) {
      for (const c in i)
        if (c !== "default" && !(c in n)) {
          const f = Object.getOwnPropertyDescriptor(i, c);
          f && Object.defineProperty(n, c, f.get ? f : {
            enumerable: !0,
            get: () => i[c]
          });
        }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
function Pw(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var Ff = { exports: {} }, Ka = {};
var zy;
function Xw() {
  if (zy) return Ka;
  zy = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), r = /* @__PURE__ */ Symbol.for("react.fragment");
  function a(i, c, f) {
    var p = null;
    if (f !== void 0 && (p = "" + f), c.key !== void 0 && (p = "" + c.key), "key" in c) {
      f = {};
      for (var g in c)
        g !== "key" && (f[g] = c[g]);
    } else f = c;
    return c = f.ref, {
      $$typeof: n,
      type: i,
      key: p,
      ref: c !== void 0 ? c : null,
      props: f
    };
  }
  return Ka.Fragment = r, Ka.jsx = a, Ka.jsxs = a, Ka;
}
var Dy;
function Kw() {
  return Dy || (Dy = 1, Ff.exports = Xw()), Ff.exports;
}
var k = Kw(), Jf = { exports: {} }, qe = {};
var Ny;
function Qw() {
  if (Ny) return qe;
  Ny = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), r = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), c = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), b = /* @__PURE__ */ Symbol.for("react.lazy"), v = /* @__PURE__ */ Symbol.for("react.activity"), x = Symbol.iterator;
  function T(E) {
    return E === null || typeof E != "object" ? null : (E = x && E[x] || E["@@iterator"], typeof E == "function" ? E : null);
  }
  var S = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, C = Object.assign, R = {};
  function A(E, H, te) {
    this.props = E, this.context = H, this.refs = R, this.updater = te || S;
  }
  A.prototype.isReactComponent = {}, A.prototype.setState = function(E, H) {
    if (typeof E != "object" && typeof E != "function" && E != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, E, H, "setState");
  }, A.prototype.forceUpdate = function(E) {
    this.updater.enqueueForceUpdate(this, E, "forceUpdate");
  };
  function O() {
  }
  O.prototype = A.prototype;
  function z(E, H, te) {
    this.props = E, this.context = H, this.refs = R, this.updater = te || S;
  }
  var M = z.prototype = new O();
  M.constructor = z, C(M, A.prototype), M.isPureReactComponent = !0;
  var L = Array.isArray;
  function D() {
  }
  var j = { H: null, A: null, T: null, S: null }, _ = Object.prototype.hasOwnProperty;
  function X(E, H, te) {
    var ee = te.ref;
    return {
      $$typeof: n,
      type: E,
      key: H,
      ref: ee !== void 0 ? ee : null,
      props: te
    };
  }
  function q(E, H) {
    return X(E.type, H, E.props);
  }
  function re(E) {
    return typeof E == "object" && E !== null && E.$$typeof === n;
  }
  function Q(E) {
    var H = { "=": "=0", ":": "=2" };
    return "$" + E.replace(/[=:]/g, function(te) {
      return H[te];
    });
  }
  var J = /\/+/g;
  function Z(E, H) {
    return typeof E == "object" && E !== null && E.key != null ? Q("" + E.key) : H.toString(36);
  }
  function G(E) {
    switch (E.status) {
      case "fulfilled":
        return E.value;
      case "rejected":
        throw E.reason;
      default:
        switch (typeof E.status == "string" ? E.then(D, D) : (E.status = "pending", E.then(
          function(H) {
            E.status === "pending" && (E.status = "fulfilled", E.value = H);
          },
          function(H) {
            E.status === "pending" && (E.status = "rejected", E.reason = H);
          }
        )), E.status) {
          case "fulfilled":
            return E.value;
          case "rejected":
            throw E.reason;
        }
    }
    throw E;
  }
  function N(E, H, te, ee, ie) {
    var ae = typeof E;
    (ae === "undefined" || ae === "boolean") && (E = null);
    var le = !1;
    if (E === null) le = !0;
    else
      switch (ae) {
        case "bigint":
        case "string":
        case "number":
          le = !0;
          break;
        case "object":
          switch (E.$$typeof) {
            case n:
            case r:
              le = !0;
              break;
            case b:
              return le = E._init, N(
                le(E._payload),
                H,
                te,
                ee,
                ie
              );
          }
      }
    if (le)
      return ie = ie(E), le = ee === "" ? "." + Z(E, 0) : ee, L(ie) ? (te = "", le != null && (te = le.replace(J, "$&/") + "/"), N(ie, H, te, "", function(_e) {
        return _e;
      })) : ie != null && (re(ie) && (ie = q(
        ie,
        te + (ie.key == null || E && E.key === ie.key ? "" : ("" + ie.key).replace(
          J,
          "$&/"
        ) + "/") + le
      )), H.push(ie)), 1;
    le = 0;
    var se = ee === "" ? "." : ee + ":";
    if (L(E))
      for (var ge = 0; ge < E.length; ge++)
        ee = E[ge], ae = se + Z(ee, ge), le += N(
          ee,
          H,
          te,
          ae,
          ie
        );
    else if (ge = T(E), typeof ge == "function")
      for (E = ge.call(E), ge = 0; !(ee = E.next()).done; )
        ee = ee.value, ae = se + Z(ee, ge++), le += N(
          ee,
          H,
          te,
          ae,
          ie
        );
    else if (ae === "object") {
      if (typeof E.then == "function")
        return N(
          G(E),
          H,
          te,
          ee,
          ie
        );
      throw H = String(E), Error(
        "Objects are not valid as a React child (found: " + (H === "[object Object]" ? "object with keys {" + Object.keys(E).join(", ") + "}" : H) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return le;
  }
  function Y(E, H, te) {
    if (E == null) return E;
    var ee = [], ie = 0;
    return N(E, ee, "", "", function(ae) {
      return H.call(te, ae, ie++);
    }), ee;
  }
  function I(E) {
    if (E._status === -1) {
      var H = E._result;
      H = H(), H.then(
        function(te) {
          (E._status === 0 || E._status === -1) && (E._status = 1, E._result = te);
        },
        function(te) {
          (E._status === 0 || E._status === -1) && (E._status = 2, E._result = te);
        }
      ), E._status === -1 && (E._status = 0, E._result = H);
    }
    if (E._status === 1) return E._result.default;
    throw E._result;
  }
  var K = typeof reportError == "function" ? reportError : function(E) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var H = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof E == "object" && E !== null && typeof E.message == "string" ? String(E.message) : String(E),
        error: E
      });
      if (!window.dispatchEvent(H)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", E);
      return;
    }
    console.error(E);
  }, B = {
    map: Y,
    forEach: function(E, H, te) {
      Y(
        E,
        function() {
          H.apply(this, arguments);
        },
        te
      );
    },
    count: function(E) {
      var H = 0;
      return Y(E, function() {
        H++;
      }), H;
    },
    toArray: function(E) {
      return Y(E, function(H) {
        return H;
      }) || [];
    },
    only: function(E) {
      if (!re(E))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return E;
    }
  };
  return qe.Activity = v, qe.Children = B, qe.Component = A, qe.Fragment = a, qe.Profiler = c, qe.PureComponent = z, qe.StrictMode = i, qe.Suspense = m, qe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = j, qe.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(E) {
      return j.H.useMemoCache(E);
    }
  }, qe.cache = function(E) {
    return function() {
      return E.apply(null, arguments);
    };
  }, qe.cacheSignal = function() {
    return null;
  }, qe.cloneElement = function(E, H, te) {
    if (E == null)
      throw Error(
        "The argument must be a React element, but you passed " + E + "."
      );
    var ee = C({}, E.props), ie = E.key;
    if (H != null)
      for (ae in H.key !== void 0 && (ie = "" + H.key), H)
        !_.call(H, ae) || ae === "key" || ae === "__self" || ae === "__source" || ae === "ref" && H.ref === void 0 || (ee[ae] = H[ae]);
    var ae = arguments.length - 2;
    if (ae === 1) ee.children = te;
    else if (1 < ae) {
      for (var le = Array(ae), se = 0; se < ae; se++)
        le[se] = arguments[se + 2];
      ee.children = le;
    }
    return X(E.type, ie, ee);
  }, qe.createContext = function(E) {
    return E = {
      $$typeof: p,
      _currentValue: E,
      _currentValue2: E,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, E.Provider = E, E.Consumer = {
      $$typeof: f,
      _context: E
    }, E;
  }, qe.createElement = function(E, H, te) {
    var ee, ie = {}, ae = null;
    if (H != null)
      for (ee in H.key !== void 0 && (ae = "" + H.key), H)
        _.call(H, ee) && ee !== "key" && ee !== "__self" && ee !== "__source" && (ie[ee] = H[ee]);
    var le = arguments.length - 2;
    if (le === 1) ie.children = te;
    else if (1 < le) {
      for (var se = Array(le), ge = 0; ge < le; ge++)
        se[ge] = arguments[ge + 2];
      ie.children = se;
    }
    if (E && E.defaultProps)
      for (ee in le = E.defaultProps, le)
        ie[ee] === void 0 && (ie[ee] = le[ee]);
    return X(E, ae, ie);
  }, qe.createRef = function() {
    return { current: null };
  }, qe.forwardRef = function(E) {
    return { $$typeof: g, render: E };
  }, qe.isValidElement = re, qe.lazy = function(E) {
    return {
      $$typeof: b,
      _payload: { _status: -1, _result: E },
      _init: I
    };
  }, qe.memo = function(E, H) {
    return {
      $$typeof: d,
      type: E,
      compare: H === void 0 ? null : H
    };
  }, qe.startTransition = function(E) {
    var H = j.T, te = {};
    j.T = te;
    try {
      var ee = E(), ie = j.S;
      ie !== null && ie(te, ee), typeof ee == "object" && ee !== null && typeof ee.then == "function" && ee.then(D, K);
    } catch (ae) {
      K(ae);
    } finally {
      H !== null && te.types !== null && (H.types = te.types), j.T = H;
    }
  }, qe.unstable_useCacheRefresh = function() {
    return j.H.useCacheRefresh();
  }, qe.use = function(E) {
    return j.H.use(E);
  }, qe.useActionState = function(E, H, te) {
    return j.H.useActionState(E, H, te);
  }, qe.useCallback = function(E, H) {
    return j.H.useCallback(E, H);
  }, qe.useContext = function(E) {
    return j.H.useContext(E);
  }, qe.useDebugValue = function() {
  }, qe.useDeferredValue = function(E, H) {
    return j.H.useDeferredValue(E, H);
  }, qe.useEffect = function(E, H) {
    return j.H.useEffect(E, H);
  }, qe.useEffectEvent = function(E) {
    return j.H.useEffectEvent(E);
  }, qe.useId = function() {
    return j.H.useId();
  }, qe.useImperativeHandle = function(E, H, te) {
    return j.H.useImperativeHandle(E, H, te);
  }, qe.useInsertionEffect = function(E, H) {
    return j.H.useInsertionEffect(E, H);
  }, qe.useLayoutEffect = function(E, H) {
    return j.H.useLayoutEffect(E, H);
  }, qe.useMemo = function(E, H) {
    return j.H.useMemo(E, H);
  }, qe.useOptimistic = function(E, H) {
    return j.H.useOptimistic(E, H);
  }, qe.useReducer = function(E, H, te) {
    return j.H.useReducer(E, H, te);
  }, qe.useRef = function(E) {
    return j.H.useRef(E);
  }, qe.useState = function(E) {
    return j.H.useState(E);
  }, qe.useSyncExternalStore = function(E, H, te) {
    return j.H.useSyncExternalStore(
      E,
      H,
      te
    );
  }, qe.useTransition = function() {
    return j.H.useTransition();
  }, qe.version = "19.2.7", qe;
}
var _y;
function mi() {
  return _y || (_y = 1, Jf.exports = Qw()), Jf.exports;
}
var y = mi();
const xd = /* @__PURE__ */ Pw(y), Zw = /* @__PURE__ */ qw({
  __proto__: null,
  default: xd
}, [y]);
var Wf = { exports: {} }, Qa = {}, $f = { exports: {} }, ed = {};
var ky;
function Fw() {
  return ky || (ky = 1, (function(n) {
    function r(N, Y) {
      var I = N.length;
      N.push(Y);
      e: for (; 0 < I; ) {
        var K = I - 1 >>> 1, B = N[K];
        if (0 < c(B, Y))
          N[K] = Y, N[I] = B, I = K;
        else break e;
      }
    }
    function a(N) {
      return N.length === 0 ? null : N[0];
    }
    function i(N) {
      if (N.length === 0) return null;
      var Y = N[0], I = N.pop();
      if (I !== Y) {
        N[0] = I;
        e: for (var K = 0, B = N.length, E = B >>> 1; K < E; ) {
          var H = 2 * (K + 1) - 1, te = N[H], ee = H + 1, ie = N[ee];
          if (0 > c(te, I))
            ee < B && 0 > c(ie, te) ? (N[K] = ie, N[ee] = I, K = ee) : (N[K] = te, N[H] = I, K = H);
          else if (ee < B && 0 > c(ie, I))
            N[K] = ie, N[ee] = I, K = ee;
          else break e;
        }
      }
      return Y;
    }
    function c(N, Y) {
      var I = N.sortIndex - Y.sortIndex;
      return I !== 0 ? I : N.id - Y.id;
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
    var m = [], d = [], b = 1, v = null, x = 3, T = !1, S = !1, C = !1, R = !1, A = typeof setTimeout == "function" ? setTimeout : null, O = typeof clearTimeout == "function" ? clearTimeout : null, z = typeof setImmediate < "u" ? setImmediate : null;
    function M(N) {
      for (var Y = a(d); Y !== null; ) {
        if (Y.callback === null) i(d);
        else if (Y.startTime <= N)
          i(d), Y.sortIndex = Y.expirationTime, r(m, Y);
        else break;
        Y = a(d);
      }
    }
    function L(N) {
      if (C = !1, M(N), !S)
        if (a(m) !== null)
          S = !0, D || (D = !0, Q());
        else {
          var Y = a(d);
          Y !== null && G(L, Y.startTime - N);
        }
    }
    var D = !1, j = -1, _ = 5, X = -1;
    function q() {
      return R ? !0 : !(n.unstable_now() - X < _);
    }
    function re() {
      if (R = !1, D) {
        var N = n.unstable_now();
        X = N;
        var Y = !0;
        try {
          e: {
            S = !1, C && (C = !1, O(j), j = -1), T = !0;
            var I = x;
            try {
              t: {
                for (M(N), v = a(m); v !== null && !(v.expirationTime > N && q()); ) {
                  var K = v.callback;
                  if (typeof K == "function") {
                    v.callback = null, x = v.priorityLevel;
                    var B = K(
                      v.expirationTime <= N
                    );
                    if (N = n.unstable_now(), typeof B == "function") {
                      v.callback = B, M(N), Y = !0;
                      break t;
                    }
                    v === a(m) && i(m), M(N);
                  } else i(m);
                  v = a(m);
                }
                if (v !== null) Y = !0;
                else {
                  var E = a(d);
                  E !== null && G(
                    L,
                    E.startTime - N
                  ), Y = !1;
                }
              }
              break e;
            } finally {
              v = null, x = I, T = !1;
            }
            Y = void 0;
          }
        } finally {
          Y ? Q() : D = !1;
        }
      }
    }
    var Q;
    if (typeof z == "function")
      Q = function() {
        z(re);
      };
    else if (typeof MessageChannel < "u") {
      var J = new MessageChannel(), Z = J.port2;
      J.port1.onmessage = re, Q = function() {
        Z.postMessage(null);
      };
    } else
      Q = function() {
        A(re, 0);
      };
    function G(N, Y) {
      j = A(function() {
        N(n.unstable_now());
      }, Y);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(N) {
      N.callback = null;
    }, n.unstable_forceFrameRate = function(N) {
      0 > N || 125 < N ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : _ = 0 < N ? Math.floor(1e3 / N) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return x;
    }, n.unstable_next = function(N) {
      switch (x) {
        case 1:
        case 2:
        case 3:
          var Y = 3;
          break;
        default:
          Y = x;
      }
      var I = x;
      x = Y;
      try {
        return N();
      } finally {
        x = I;
      }
    }, n.unstable_requestPaint = function() {
      R = !0;
    }, n.unstable_runWithPriority = function(N, Y) {
      switch (N) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          N = 3;
      }
      var I = x;
      x = N;
      try {
        return Y();
      } finally {
        x = I;
      }
    }, n.unstable_scheduleCallback = function(N, Y, I) {
      var K = n.unstable_now();
      switch (typeof I == "object" && I !== null ? (I = I.delay, I = typeof I == "number" && 0 < I ? K + I : K) : I = K, N) {
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
      return B = I + B, N = {
        id: b++,
        callback: Y,
        priorityLevel: N,
        startTime: I,
        expirationTime: B,
        sortIndex: -1
      }, I > K ? (N.sortIndex = I, r(d, N), a(m) === null && N === a(d) && (C ? (O(j), j = -1) : C = !0, G(L, I - K))) : (N.sortIndex = B, r(m, N), S || T || (S = !0, D || (D = !0, Q()))), N;
    }, n.unstable_shouldYield = q, n.unstable_wrapCallback = function(N) {
      var Y = x;
      return function() {
        var I = x;
        x = Y;
        try {
          return N.apply(this, arguments);
        } finally {
          x = I;
        }
      };
    };
  })(ed)), ed;
}
var Hy;
function Jw() {
  return Hy || (Hy = 1, $f.exports = Fw()), $f.exports;
}
var td = { exports: {} }, gn = {};
var jy;
function Ww() {
  if (jy) return gn;
  jy = 1;
  var n = mi();
  function r(m) {
    var d = "https://react.dev/errors/" + m;
    if (1 < arguments.length) {
      d += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var b = 2; b < arguments.length; b++)
        d += "&args[]=" + encodeURIComponent(arguments[b]);
    }
    return "Minified React error #" + m + "; visit " + d + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function a() {
  }
  var i = {
    d: {
      f: a,
      r: function() {
        throw Error(r(522));
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
  }, c = /* @__PURE__ */ Symbol.for("react.portal");
  function f(m, d, b) {
    var v = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: c,
      key: v == null ? null : "" + v,
      children: m,
      containerInfo: d,
      implementation: b
    };
  }
  var p = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function g(m, d) {
    if (m === "font") return "";
    if (typeof d == "string")
      return d === "use-credentials" ? d : "";
  }
  return gn.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, gn.createPortal = function(m, d) {
    var b = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!d || d.nodeType !== 1 && d.nodeType !== 9 && d.nodeType !== 11)
      throw Error(r(299));
    return f(m, d, null, b);
  }, gn.flushSync = function(m) {
    var d = p.T, b = i.p;
    try {
      if (p.T = null, i.p = 2, m) return m();
    } finally {
      p.T = d, i.p = b, i.d.f();
    }
  }, gn.preconnect = function(m, d) {
    typeof m == "string" && (d ? (d = d.crossOrigin, d = typeof d == "string" ? d === "use-credentials" ? d : "" : void 0) : d = null, i.d.C(m, d));
  }, gn.prefetchDNS = function(m) {
    typeof m == "string" && i.d.D(m);
  }, gn.preinit = function(m, d) {
    if (typeof m == "string" && d && typeof d.as == "string") {
      var b = d.as, v = g(b, d.crossOrigin), x = typeof d.integrity == "string" ? d.integrity : void 0, T = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      b === "style" ? i.d.S(
        m,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: v,
          integrity: x,
          fetchPriority: T
        }
      ) : b === "script" && i.d.X(m, {
        crossOrigin: v,
        integrity: x,
        fetchPriority: T,
        nonce: typeof d.nonce == "string" ? d.nonce : void 0
      });
    }
  }, gn.preinitModule = function(m, d) {
    if (typeof m == "string")
      if (typeof d == "object" && d !== null) {
        if (d.as == null || d.as === "script") {
          var b = g(
            d.as,
            d.crossOrigin
          );
          i.d.M(m, {
            crossOrigin: b,
            integrity: typeof d.integrity == "string" ? d.integrity : void 0,
            nonce: typeof d.nonce == "string" ? d.nonce : void 0
          });
        }
      } else d == null && i.d.M(m);
  }, gn.preload = function(m, d) {
    if (typeof m == "string" && typeof d == "object" && d !== null && typeof d.as == "string") {
      var b = d.as, v = g(b, d.crossOrigin);
      i.d.L(m, b, {
        crossOrigin: v,
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
  }, gn.preloadModule = function(m, d) {
    if (typeof m == "string")
      if (d) {
        var b = g(d.as, d.crossOrigin);
        i.d.m(m, {
          as: typeof d.as == "string" && d.as !== "script" ? d.as : void 0,
          crossOrigin: b,
          integrity: typeof d.integrity == "string" ? d.integrity : void 0
        });
      } else i.d.m(m);
  }, gn.requestFormReset = function(m) {
    i.d.r(m);
  }, gn.unstable_batchedUpdates = function(m, d) {
    return m(d);
  }, gn.useFormState = function(m, d, b) {
    return p.H.useFormState(m, d, b);
  }, gn.useFormStatus = function() {
    return p.H.useHostTransitionStatus();
  }, gn.version = "19.2.7", gn;
}
var Uy;
function Fb() {
  if (Uy) return td.exports;
  Uy = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (r) {
        console.error(r);
      }
  }
  return n(), td.exports = Ww(), td.exports;
}
var Ly;
function $w() {
  if (Ly) return Qa;
  Ly = 1;
  var n = Jw(), r = mi(), a = Fb();
  function i(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var l = 2; l < arguments.length; l++)
        t += "&args[]=" + encodeURIComponent(arguments[l]);
    }
    return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function c(e) {
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
    for (var l = e, o = t; ; ) {
      var s = l.return;
      if (s === null) break;
      var u = s.alternate;
      if (u === null) {
        if (o = s.return, o !== null) {
          l = o;
          continue;
        }
        break;
      }
      if (s.child === u.child) {
        for (u = s.child; u; ) {
          if (u === l) return m(s), e;
          if (u === o) return m(s), t;
          u = u.sibling;
        }
        throw Error(i(188));
      }
      if (l.return !== o.return) l = s, o = u;
      else {
        for (var h = !1, w = s.child; w; ) {
          if (w === l) {
            h = !0, l = s, o = u;
            break;
          }
          if (w === o) {
            h = !0, o = s, l = u;
            break;
          }
          w = w.sibling;
        }
        if (!h) {
          for (w = u.child; w; ) {
            if (w === l) {
              h = !0, l = u, o = s;
              break;
            }
            if (w === o) {
              h = !0, o = u, l = s;
              break;
            }
            w = w.sibling;
          }
          if (!h) throw Error(i(189));
        }
      }
      if (l.alternate !== o) throw Error(i(190));
    }
    if (l.tag !== 3) throw Error(i(188));
    return l.stateNode.current === l ? e : t;
  }
  function b(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (t = b(e), t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var v = Object.assign, x = /* @__PURE__ */ Symbol.for("react.element"), T = /* @__PURE__ */ Symbol.for("react.transitional.element"), S = /* @__PURE__ */ Symbol.for("react.portal"), C = /* @__PURE__ */ Symbol.for("react.fragment"), R = /* @__PURE__ */ Symbol.for("react.strict_mode"), A = /* @__PURE__ */ Symbol.for("react.profiler"), O = /* @__PURE__ */ Symbol.for("react.consumer"), z = /* @__PURE__ */ Symbol.for("react.context"), M = /* @__PURE__ */ Symbol.for("react.forward_ref"), L = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), j = /* @__PURE__ */ Symbol.for("react.memo"), _ = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.activity"), q = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), re = Symbol.iterator;
  function Q(e) {
    return e === null || typeof e != "object" ? null : (e = re && e[re] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var J = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Z(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === J ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case C:
        return "Fragment";
      case A:
        return "Profiler";
      case R:
        return "StrictMode";
      case L:
        return "Suspense";
      case D:
        return "SuspenseList";
      case X:
        return "Activity";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case S:
          return "Portal";
        case z:
          return e.displayName || "Context";
        case O:
          return (e._context.displayName || "Context") + ".Consumer";
        case M:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case j:
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
  var G = Array.isArray, N = r.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Y = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, I = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, K = [], B = -1;
  function E(e) {
    return { current: e };
  }
  function H(e) {
    0 > B || (e.current = K[B], K[B] = null, B--);
  }
  function te(e, t) {
    B++, K[B] = e.current, e.current = t;
  }
  var ee = E(null), ie = E(null), ae = E(null), le = E(null);
  function se(e, t) {
    switch (te(ae, t), te(ie, e), te(ee, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? $h(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = $h(t), e = ey(t, e);
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
    H(ee), te(ee, e);
  }
  function ge() {
    H(ee), H(ie), H(ae);
  }
  function _e(e) {
    e.memoizedState !== null && te(le, e);
    var t = ee.current, l = ey(t, e.type);
    t !== l && (te(ie, e), te(ee, l));
  }
  function Ee(e) {
    ie.current === e && (H(ee), H(ie)), le.current === e && (H(le), Ga._currentValue = I);
  }
  var fe, ye;
  function Te(e) {
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
  var He = !1;
  function ke(e, t) {
    if (!e || He) return "";
    He = !0;
    var l = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var o = {
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
                } catch (ne) {
                  var $ = ne;
                }
                Reflect.construct(e, [], de);
              } else {
                try {
                  de.call();
                } catch (ne) {
                  $ = ne;
                }
                e.call(de.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (ne) {
                $ = ne;
              }
              (de = e()) && typeof de.catch == "function" && de.catch(function() {
              });
            }
          } catch (ne) {
            if (ne && $ && typeof ne.stack == "string")
              return [ne.stack, $.stack];
          }
          return [null, null];
        }
      };
      o.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var s = Object.getOwnPropertyDescriptor(
        o.DetermineComponentFrameRoot,
        "name"
      );
      s && s.configurable && Object.defineProperty(
        o.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var u = o.DetermineComponentFrameRoot(), h = u[0], w = u[1];
      if (h && w) {
        var U = h.split(`
`), W = w.split(`
`);
        for (s = o = 0; o < U.length && !U[o].includes("DetermineComponentFrameRoot"); )
          o++;
        for (; s < W.length && !W[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (o === U.length || s === W.length)
          for (o = U.length - 1, s = W.length - 1; 1 <= o && 0 <= s && U[o] !== W[s]; )
            s--;
        for (; 1 <= o && 0 <= s; o--, s--)
          if (U[o] !== W[s]) {
            if (o !== 1 || s !== 1)
              do
                if (o--, s--, 0 > s || U[o] !== W[s]) {
                  var ue = `
` + U[o].replace(" at new ", " at ");
                  return e.displayName && ue.includes("<anonymous>") && (ue = ue.replace("<anonymous>", e.displayName)), ue;
                }
              while (1 <= o && 0 <= s);
            break;
          }
      }
    } finally {
      He = !1, Error.prepareStackTrace = l;
    }
    return (l = e ? e.displayName || e.name : "") ? Te(l) : "";
  }
  function we(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return Te(e.type);
      case 16:
        return Te("Lazy");
      case 13:
        return e.child !== t && t !== null ? Te("Suspense Fallback") : Te("Suspense");
      case 19:
        return Te("SuspenseList");
      case 0:
      case 15:
        return ke(e.type, !1);
      case 11:
        return ke(e.type.render, !1);
      case 1:
        return ke(e.type, !0);
      case 31:
        return Te("Activity");
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
    } catch (o) {
      return `
Error generating stack: ` + o.message + `
` + o.stack;
    }
  }
  var he = Object.prototype.hasOwnProperty, Se = n.unstable_scheduleCallback, Re = n.unstable_cancelCallback, Oe = n.unstable_shouldYield, je = n.unstable_requestPaint, oe = n.unstable_now, pe = n.unstable_getCurrentPriorityLevel, Ue = n.unstable_ImmediatePriority, be = n.unstable_UserBlockingPriority, ve = n.unstable_NormalPriority, We = n.unstable_LowPriority, lt = n.unstable_IdlePriority, pt = n.log, zt = n.unstable_setDisableYieldValue, $e = null, gt = null;
  function Mt(e) {
    if (typeof pt == "function" && zt(e), gt && typeof gt.setStrictMode == "function")
      try {
        gt.setStrictMode($e, e);
      } catch {
      }
  }
  var mt = Math.clz32 ? Math.clz32 : Qe, On = Math.log, Mn = Math.LN2;
  function Qe(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (On(e) / Mn | 0) | 0;
  }
  var ft = 256, Ut = 262144, kt = 4194304;
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
  function Dt(e, t, l) {
    var o = e.pendingLanes;
    if (o === 0) return 0;
    var s = 0, u = e.suspendedLanes, h = e.pingedLanes;
    e = e.warmLanes;
    var w = o & 134217727;
    return w !== 0 ? (o = w & ~u, o !== 0 ? s = Ht(o) : (h &= w, h !== 0 ? s = Ht(h) : l || (l = w & ~e, l !== 0 && (s = Ht(l))))) : (w = o & ~u, w !== 0 ? s = Ht(w) : h !== 0 ? s = Ht(h) : l || (l = o & ~e, l !== 0 && (s = Ht(l)))), s === 0 ? 0 : t !== 0 && t !== s && (t & u) === 0 && (u = s & -s, l = t & -t, u >= l || u === 32 && (l & 4194048) !== 0) ? t : s;
  }
  function Yt(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
  }
  function bn(e, t) {
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
  function An() {
    var e = kt;
    return kt <<= 1, (kt & 62914560) === 0 && (kt = 4194304), e;
  }
  function Bn(e) {
    for (var t = [], l = 0; 31 > l; l++) t.push(e);
    return t;
  }
  function Gt(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function In(e, t, l, o, s, u) {
    var h = e.pendingLanes;
    e.pendingLanes = l, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= l, e.entangledLanes &= l, e.errorRecoveryDisabledLanes &= l, e.shellSuspendCounter = 0;
    var w = e.entanglements, U = e.expirationTimes, W = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ue = 31 - mt(l), de = 1 << ue;
      w[ue] = 0, U[ue] = -1;
      var $ = W[ue];
      if ($ !== null)
        for (W[ue] = null, ue = 0; ue < $.length; ue++) {
          var ne = $[ue];
          ne !== null && (ne.lane &= -536870913);
        }
      l &= ~de;
    }
    o !== 0 && gl(e, o, 0), u !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= u & ~(h & ~t));
  }
  function gl(e, t, l) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var o = 31 - mt(t);
    e.entangledLanes |= t, e.entanglements[o] = e.entanglements[o] | 1073741824 | l & 261930;
  }
  function Wn(e, t) {
    var l = e.entangledLanes |= t;
    for (e = e.entanglements; l; ) {
      var o = 31 - mt(l), s = 1 << o;
      s & t | e[o] & t && (e[o] |= t), l &= ~s;
    }
  }
  function ml(e, t) {
    var l = t & -t;
    return l = (l & 42) !== 0 ? 1 : Pe(l), (l & (e.suspendedLanes | t)) !== 0 ? 0 : l;
  }
  function Pe(e) {
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
  function bt(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function qt() {
    var e = Y.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Ey(e.type));
  }
  function en(e, t) {
    var l = Y.p;
    try {
      return Y.p = e, t();
    } finally {
      Y.p = l;
    }
  }
  var Jt = Math.random().toString(36).slice(2), Rt = "__reactFiber$" + Jt, an = "__reactProps$" + Jt, ll = "__reactContainer$" + Jt, la = "__reactEvents$" + Jt, xi = "__reactListeners$" + Jt, kx = "__reactHandles$" + Jt, Ip = "__reactResources$" + Jt, oa = "__reactMarker$" + Jt;
  function Vu(e) {
    delete e[Rt], delete e[an], delete e[la], delete e[xi], delete e[kx];
  }
  function sr(e) {
    var t = e[Rt];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[ll] || l[Rt]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = iy(e); e !== null; ) {
            if (l = e[Rt]) return l;
            e = iy(e);
          }
        return t;
      }
      e = l, l = e.parentNode;
    }
    return null;
  }
  function ur(e) {
    if (e = e[Rt] || e[ll]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return e;
    }
    return null;
  }
  function ra(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function cr(e) {
    var t = e[Ip];
    return t || (t = e[Ip] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function tn(e) {
    e[oa] = !0;
  }
  var Vp = /* @__PURE__ */ new Set(), Yp = {};
  function Ao(e, t) {
    fr(e, t), fr(e + "Capture", t);
  }
  function fr(e, t) {
    for (Yp[e] = t, e = 0; e < t.length; e++)
      Vp.add(t[e]);
  }
  var Hx = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Gp = {}, qp = {};
  function jx(e) {
    return he.call(qp, e) ? !0 : he.call(Gp, e) ? !1 : Hx.test(e) ? qp[e] = !0 : (Gp[e] = !0, !1);
  }
  function Si(e, t, l) {
    if (jx(t))
      if (l === null) e.removeAttribute(t);
      else {
        switch (typeof l) {
          case "undefined":
          case "function":
          case "symbol":
            e.removeAttribute(t);
            return;
          case "boolean":
            var o = t.toLowerCase().slice(0, 5);
            if (o !== "data-" && o !== "aria-") {
              e.removeAttribute(t);
              return;
            }
        }
        e.setAttribute(t, "" + l);
      }
  }
  function wi(e, t, l) {
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
  function hl(e, t, l, o) {
    if (o === null) e.removeAttribute(l);
    else {
      switch (typeof o) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(l);
          return;
      }
      e.setAttributeNS(t, l, "" + o);
    }
  }
  function Vn(e) {
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
  function Pp(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function Ux(e, t, l) {
    var o = Object.getOwnPropertyDescriptor(
      e.constructor.prototype,
      t
    );
    if (!e.hasOwnProperty(t) && typeof o < "u" && typeof o.get == "function" && typeof o.set == "function") {
      var s = o.get, u = o.set;
      return Object.defineProperty(e, t, {
        configurable: !0,
        get: function() {
          return s.call(this);
        },
        set: function(h) {
          l = "" + h, u.call(this, h);
        }
      }), Object.defineProperty(e, t, {
        enumerable: o.enumerable
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
  function Yu(e) {
    if (!e._valueTracker) {
      var t = Pp(e) ? "checked" : "value";
      e._valueTracker = Ux(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function Xp(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), o = "";
    return e && (o = Pp(e) ? e.checked ? "true" : "false" : e.value), e = o, e !== l ? (t.setValue(e), !0) : !1;
  }
  function Ei(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var Lx = /[\n"\\]/g;
  function Yn(e) {
    return e.replace(
      Lx,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function Gu(e, t, l, o, s, u, h, w) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Vn(t)) : e.value !== "" + Vn(t) && (e.value = "" + Vn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? qu(e, h, Vn(t)) : l != null ? qu(e, h, Vn(l)) : o != null && e.removeAttribute("value"), s == null && u != null && (e.defaultChecked = !!u), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), w != null && typeof w != "function" && typeof w != "symbol" && typeof w != "boolean" ? e.name = "" + Vn(w) : e.removeAttribute("name");
  }
  function Kp(e, t, l, o, s, u, h, w) {
    if (u != null && typeof u != "function" && typeof u != "symbol" && typeof u != "boolean" && (e.type = u), t != null || l != null) {
      if (!(u !== "submit" && u !== "reset" || t != null)) {
        Yu(e);
        return;
      }
      l = l != null ? "" + Vn(l) : "", t = t != null ? "" + Vn(t) : l, w || t === e.value || (e.value = t), e.defaultValue = t;
    }
    o = o ?? s, o = typeof o != "function" && typeof o != "symbol" && !!o, e.checked = w ? e.checked : !!o, e.defaultChecked = !!o, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), Yu(e);
  }
  function qu(e, t, l) {
    t === "number" && Ei(e.ownerDocument) === e || e.defaultValue === "" + l || (e.defaultValue = "" + l);
  }
  function dr(e, t, l, o) {
    if (e = e.options, t) {
      t = {};
      for (var s = 0; s < l.length; s++)
        t["$" + l[s]] = !0;
      for (l = 0; l < e.length; l++)
        s = t.hasOwnProperty("$" + e[l].value), e[l].selected !== s && (e[l].selected = s), s && o && (e[l].defaultSelected = !0);
    } else {
      for (l = "" + Vn(l), t = null, s = 0; s < e.length; s++) {
        if (e[s].value === l) {
          e[s].selected = !0, o && (e[s].defaultSelected = !0);
          return;
        }
        t !== null || e[s].disabled || (t = e[s]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Qp(e, t, l) {
    if (t != null && (t = "" + Vn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Vn(l) : "";
  }
  function Zp(e, t, l, o) {
    if (t == null) {
      if (o != null) {
        if (l != null) throw Error(i(92));
        if (G(o)) {
          if (1 < o.length) throw Error(i(93));
          o = o[0];
        }
        l = o;
      }
      l == null && (l = ""), t = l;
    }
    l = Vn(t), e.defaultValue = l, o = e.textContent, o === l && o !== "" && o !== null && (e.value = o), Yu(e);
  }
  function pr(e, t) {
    if (t) {
      var l = e.firstChild;
      if (l && l === e.lastChild && l.nodeType === 3) {
        l.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var Bx = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Fp(e, t, l) {
    var o = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? o ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : o ? e.setProperty(t, l) : typeof l != "number" || l === 0 || Bx.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function Jp(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var o in l)
        !l.hasOwnProperty(o) || t != null && t.hasOwnProperty(o) || (o.indexOf("--") === 0 ? e.setProperty(o, "") : o === "float" ? e.cssFloat = "" : e[o] = "");
      for (var s in t)
        o = t[s], t.hasOwnProperty(s) && l[s] !== o && Fp(e, s, o);
    } else
      for (var u in t)
        t.hasOwnProperty(u) && Fp(e, u, t[u]);
  }
  function Pu(e) {
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
  var Ix = /* @__PURE__ */ new Map([
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
  ]), Vx = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ri(e) {
    return Vx.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function yl() {
  }
  var Xu = null;
  function Ku(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var gr = null, mr = null;
  function Wp(e) {
    var t = ur(e);
    if (t && (e = t.stateNode)) {
      var l = e[an] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Gu(
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
              'input[name="' + Yn(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < l.length; t++) {
              var o = l[t];
              if (o !== e && o.form === e.form) {
                var s = o[an] || null;
                if (!s) throw Error(i(90));
                Gu(
                  o,
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
              o = l[t], o.form === e.form && Xp(o);
          }
          break e;
        case "textarea":
          Qp(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && dr(e, !!l.multiple, t, !1);
      }
    }
  }
  var Qu = !1;
  function $p(e, t, l) {
    if (Qu) return e(t, l);
    Qu = !0;
    try {
      var o = e(t);
      return o;
    } finally {
      if (Qu = !1, (gr !== null || mr !== null) && (fs(), gr && (t = gr, e = mr, mr = gr = null, Wp(t), e)))
        for (t = 0; t < e.length; t++) Wp(e[t]);
    }
  }
  function aa(e, t) {
    var l = e.stateNode;
    if (l === null) return null;
    var o = l[an] || null;
    if (o === null) return null;
    l = o[t];
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
        (o = !o.disabled) || (e = e.type, o = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !o;
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
  var bl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Zu = !1;
  if (bl)
    try {
      var ia = {};
      Object.defineProperty(ia, "passive", {
        get: function() {
          Zu = !0;
        }
      }), window.addEventListener("test", ia, ia), window.removeEventListener("test", ia, ia);
    } catch {
      Zu = !1;
    }
  var Kl = null, Fu = null, Ti = null;
  function eg() {
    if (Ti) return Ti;
    var e, t = Fu, l = t.length, o, s = "value" in Kl ? Kl.value : Kl.textContent, u = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var h = l - e;
    for (o = 1; o <= h && t[l - o] === s[u - o]; o++) ;
    return Ti = s.slice(e, 1 < o ? 1 - o : void 0);
  }
  function Ci(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Oi() {
    return !0;
  }
  function tg() {
    return !1;
  }
  function vn(e) {
    function t(l, o, s, u, h) {
      this._reactName = l, this._targetInst = s, this.type = o, this.nativeEvent = u, this.target = h, this.currentTarget = null;
      for (var w in e)
        e.hasOwnProperty(w) && (l = e[w], this[w] = l ? l(u) : u[w]);
      return this.isDefaultPrevented = (u.defaultPrevented != null ? u.defaultPrevented : u.returnValue === !1) ? Oi : tg, this.isPropagationStopped = tg, this;
    }
    return v(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var l = this.nativeEvent;
        l && (l.preventDefault ? l.preventDefault() : typeof l.returnValue != "unknown" && (l.returnValue = !1), this.isDefaultPrevented = Oi);
      },
      stopPropagation: function() {
        var l = this.nativeEvent;
        l && (l.stopPropagation ? l.stopPropagation() : typeof l.cancelBubble != "unknown" && (l.cancelBubble = !0), this.isPropagationStopped = Oi);
      },
      persist: function() {
      },
      isPersistent: Oi
    }), t;
  }
  var zo = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(e) {
      return e.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Mi = vn(zo), sa = v({}, zo, { view: 0, detail: 0 }), Yx = vn(sa), Ju, Wu, ua, Ai = v({}, sa, {
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
    getModifierState: ec,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ua && (ua && e.type === "mousemove" ? (Ju = e.screenX - ua.screenX, Wu = e.screenY - ua.screenY) : Wu = Ju = 0, ua = e), Ju);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : Wu;
    }
  }), ng = vn(Ai), Gx = v({}, Ai, { dataTransfer: 0 }), qx = vn(Gx), Px = v({}, sa, { relatedTarget: 0 }), $u = vn(Px), Xx = v({}, zo, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Kx = vn(Xx), Qx = v({}, zo, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), Zx = vn(Qx), Fx = v({}, zo, { data: 0 }), lg = vn(Fx), Jx = {
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
  }, Wx = {
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
  }, $x = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function eS(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = $x[e]) ? !!t[e] : !1;
  }
  function ec() {
    return eS;
  }
  var tS = v({}, sa, {
    key: function(e) {
      if (e.key) {
        var t = Jx[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = Ci(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Wx[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: ec,
    charCode: function(e) {
      return e.type === "keypress" ? Ci(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? Ci(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), nS = vn(tS), lS = v({}, Ai, {
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
  }), og = vn(lS), oS = v({}, sa, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ec
  }), rS = vn(oS), aS = v({}, zo, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), iS = vn(aS), sS = v({}, Ai, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), uS = vn(sS), cS = v({}, zo, {
    newState: 0,
    oldState: 0
  }), fS = vn(cS), dS = [9, 13, 27, 32], tc = bl && "CompositionEvent" in window, ca = null;
  bl && "documentMode" in document && (ca = document.documentMode);
  var pS = bl && "TextEvent" in window && !ca, rg = bl && (!tc || ca && 8 < ca && 11 >= ca), ag = " ", ig = !1;
  function sg(e, t) {
    switch (e) {
      case "keyup":
        return dS.indexOf(t.keyCode) !== -1;
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
  function ug(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var hr = !1;
  function gS(e, t) {
    switch (e) {
      case "compositionend":
        return ug(t);
      case "keypress":
        return t.which !== 32 ? null : (ig = !0, ag);
      case "textInput":
        return e = t.data, e === ag && ig ? null : e;
      default:
        return null;
    }
  }
  function mS(e, t) {
    if (hr)
      return e === "compositionend" || !tc && sg(e, t) ? (e = eg(), Ti = Fu = Kl = null, hr = !1, e) : null;
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
        return rg && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var hS = {
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
  function cg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!hS[e.type] : t === "textarea";
  }
  function fg(e, t, l, o) {
    gr ? mr ? mr.push(o) : mr = [o] : gr = o, t = bs(t, "onChange"), 0 < t.length && (l = new Mi(
      "onChange",
      "change",
      null,
      l,
      o
    ), e.push({ event: l, listeners: t }));
  }
  var fa = null, da = null;
  function yS(e) {
    Kh(e, 0);
  }
  function zi(e) {
    var t = ra(e);
    if (Xp(t)) return e;
  }
  function dg(e, t) {
    if (e === "change") return t;
  }
  var pg = !1;
  if (bl) {
    var nc;
    if (bl) {
      var lc = "oninput" in document;
      if (!lc) {
        var gg = document.createElement("div");
        gg.setAttribute("oninput", "return;"), lc = typeof gg.oninput == "function";
      }
      nc = lc;
    } else nc = !1;
    pg = nc && (!document.documentMode || 9 < document.documentMode);
  }
  function mg() {
    fa && (fa.detachEvent("onpropertychange", hg), da = fa = null);
  }
  function hg(e) {
    if (e.propertyName === "value" && zi(da)) {
      var t = [];
      fg(
        t,
        da,
        e,
        Ku(e)
      ), $p(yS, t);
    }
  }
  function bS(e, t, l) {
    e === "focusin" ? (mg(), fa = t, da = l, fa.attachEvent("onpropertychange", hg)) : e === "focusout" && mg();
  }
  function vS(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return zi(da);
  }
  function xS(e, t) {
    if (e === "click") return zi(t);
  }
  function SS(e, t) {
    if (e === "input" || e === "change")
      return zi(t);
  }
  function wS(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var zn = typeof Object.is == "function" ? Object.is : wS;
  function pa(e, t) {
    if (zn(e, t)) return !0;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null)
      return !1;
    var l = Object.keys(e), o = Object.keys(t);
    if (l.length !== o.length) return !1;
    for (o = 0; o < l.length; o++) {
      var s = l[o];
      if (!he.call(t, s) || !zn(e[s], t[s]))
        return !1;
    }
    return !0;
  }
  function yg(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function bg(e, t) {
    var l = yg(e);
    e = 0;
    for (var o; l; ) {
      if (l.nodeType === 3) {
        if (o = e + l.textContent.length, e <= t && o >= t)
          return { node: l, offset: t - e };
        e = o;
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
      l = yg(l);
    }
  }
  function vg(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? vg(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function xg(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = Ei(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var l = typeof t.contentWindow.location.href == "string";
      } catch {
        l = !1;
      }
      if (l) e = t.contentWindow;
      else break;
      t = Ei(e.document);
    }
    return t;
  }
  function oc(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var ES = bl && "documentMode" in document && 11 >= document.documentMode, yr = null, rc = null, ga = null, ac = !1;
  function Sg(e, t, l) {
    var o = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    ac || yr == null || yr !== Ei(o) || (o = yr, "selectionStart" in o && oc(o) ? o = { start: o.selectionStart, end: o.selectionEnd } : (o = (o.ownerDocument && o.ownerDocument.defaultView || window).getSelection(), o = {
      anchorNode: o.anchorNode,
      anchorOffset: o.anchorOffset,
      focusNode: o.focusNode,
      focusOffset: o.focusOffset
    }), ga && pa(ga, o) || (ga = o, o = bs(rc, "onSelect"), 0 < o.length && (t = new Mi(
      "onSelect",
      "select",
      null,
      t,
      l
    ), e.push({ event: t, listeners: o }), t.target = yr)));
  }
  function Do(e, t) {
    var l = {};
    return l[e.toLowerCase()] = t.toLowerCase(), l["Webkit" + e] = "webkit" + t, l["Moz" + e] = "moz" + t, l;
  }
  var br = {
    animationend: Do("Animation", "AnimationEnd"),
    animationiteration: Do("Animation", "AnimationIteration"),
    animationstart: Do("Animation", "AnimationStart"),
    transitionrun: Do("Transition", "TransitionRun"),
    transitionstart: Do("Transition", "TransitionStart"),
    transitioncancel: Do("Transition", "TransitionCancel"),
    transitionend: Do("Transition", "TransitionEnd")
  }, ic = {}, wg = {};
  bl && (wg = document.createElement("div").style, "AnimationEvent" in window || (delete br.animationend.animation, delete br.animationiteration.animation, delete br.animationstart.animation), "TransitionEvent" in window || delete br.transitionend.transition);
  function No(e) {
    if (ic[e]) return ic[e];
    if (!br[e]) return e;
    var t = br[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in wg)
        return ic[e] = t[l];
    return e;
  }
  var Eg = No("animationend"), Rg = No("animationiteration"), Tg = No("animationstart"), RS = No("transitionrun"), TS = No("transitionstart"), CS = No("transitioncancel"), Cg = No("transitionend"), Og = /* @__PURE__ */ new Map(), sc = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  sc.push("scrollEnd");
  function $n(e, t) {
    Og.set(e, t), Ao(t, [e]);
  }
  var Di = typeof reportError == "function" ? reportError : function(e) {
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
  }, Gn = [], vr = 0, uc = 0;
  function Ni() {
    for (var e = vr, t = uc = vr = 0; t < e; ) {
      var l = Gn[t];
      Gn[t++] = null;
      var o = Gn[t];
      Gn[t++] = null;
      var s = Gn[t];
      Gn[t++] = null;
      var u = Gn[t];
      if (Gn[t++] = null, o !== null && s !== null) {
        var h = o.pending;
        h === null ? s.next = s : (s.next = h.next, h.next = s), o.pending = s;
      }
      u !== 0 && Mg(l, s, u);
    }
  }
  function _i(e, t, l, o) {
    Gn[vr++] = e, Gn[vr++] = t, Gn[vr++] = l, Gn[vr++] = o, uc |= o, e.lanes |= o, e = e.alternate, e !== null && (e.lanes |= o);
  }
  function cc(e, t, l, o) {
    return _i(e, t, l, o), ki(e);
  }
  function _o(e, t) {
    return _i(e, null, null, t), ki(e);
  }
  function Mg(e, t, l) {
    e.lanes |= l;
    var o = e.alternate;
    o !== null && (o.lanes |= l);
    for (var s = !1, u = e.return; u !== null; )
      u.childLanes |= l, o = u.alternate, o !== null && (o.childLanes |= l), u.tag === 22 && (e = u.stateNode, e === null || e._visibility & 1 || (s = !0)), e = u, u = u.return;
    return e.tag === 3 ? (u = e.stateNode, s && t !== null && (s = 31 - mt(l), e = u.hiddenUpdates, o = e[s], o === null ? e[s] = [t] : o.push(t), t.lane = l | 536870912), u) : null;
  }
  function ki(e) {
    if (50 < ja)
      throw ja = 0, xf = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var xr = {};
  function OS(e, t, l, o) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = o, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Dn(e, t, l, o) {
    return new OS(e, t, l, o);
  }
  function fc(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function vl(e, t) {
    var l = e.alternate;
    return l === null ? (l = Dn(
      e.tag,
      t,
      e.key,
      e.mode
    ), l.elementType = e.elementType, l.type = e.type, l.stateNode = e.stateNode, l.alternate = e, e.alternate = l) : (l.pendingProps = t, l.type = e.type, l.flags = 0, l.subtreeFlags = 0, l.deletions = null), l.flags = e.flags & 65011712, l.childLanes = e.childLanes, l.lanes = e.lanes, l.child = e.child, l.memoizedProps = e.memoizedProps, l.memoizedState = e.memoizedState, l.updateQueue = e.updateQueue, t = e.dependencies, l.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, l.sibling = e.sibling, l.index = e.index, l.ref = e.ref, l.refCleanup = e.refCleanup, l;
  }
  function Ag(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Hi(e, t, l, o, s, u) {
    var h = 0;
    if (o = e, typeof e == "function") fc(e) && (h = 1);
    else if (typeof e == "string")
      h = Nw(
        e,
        l,
        ee.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case X:
          return e = Dn(31, l, t, s), e.elementType = X, e.lanes = u, e;
        case C:
          return ko(l.children, s, u, t);
        case R:
          h = 8, s |= 24;
          break;
        case A:
          return e = Dn(12, l, t, s | 2), e.elementType = A, e.lanes = u, e;
        case L:
          return e = Dn(13, l, t, s), e.elementType = L, e.lanes = u, e;
        case D:
          return e = Dn(19, l, t, s), e.elementType = D, e.lanes = u, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case z:
                h = 10;
                break e;
              case O:
                h = 9;
                break e;
              case M:
                h = 11;
                break e;
              case j:
                h = 14;
                break e;
              case _:
                h = 16, o = null;
                break e;
            }
          h = 29, l = Error(
            i(130, e === null ? "null" : typeof e, "")
          ), o = null;
      }
    return t = Dn(h, l, t, s), t.elementType = e, t.type = o, t.lanes = u, t;
  }
  function ko(e, t, l, o) {
    return e = Dn(7, e, o, t), e.lanes = l, e;
  }
  function dc(e, t, l) {
    return e = Dn(6, e, null, t), e.lanes = l, e;
  }
  function zg(e) {
    var t = Dn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function pc(e, t, l) {
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
  var Dg = /* @__PURE__ */ new WeakMap();
  function qn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = Dg.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, Dg.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var Sr = [], wr = 0, ji = null, ma = 0, Pn = [], Xn = 0, Ql = null, ol = 1, rl = "";
  function xl(e, t) {
    Sr[wr++] = ma, Sr[wr++] = ji, ji = e, ma = t;
  }
  function Ng(e, t, l) {
    Pn[Xn++] = ol, Pn[Xn++] = rl, Pn[Xn++] = Ql, Ql = e;
    var o = ol;
    e = rl;
    var s = 32 - mt(o) - 1;
    o &= ~(1 << s), l += 1;
    var u = 32 - mt(t) + s;
    if (30 < u) {
      var h = s - s % 5;
      u = (o & (1 << h) - 1).toString(32), o >>= h, s -= h, ol = 1 << 32 - mt(t) + s | l << s | o, rl = u + e;
    } else
      ol = 1 << u | l << s | o, rl = e;
  }
  function gc(e) {
    e.return !== null && (xl(e, 1), Ng(e, 1, 0));
  }
  function mc(e) {
    for (; e === ji; )
      ji = Sr[--wr], Sr[wr] = null, ma = Sr[--wr], Sr[wr] = null;
    for (; e === Ql; )
      Ql = Pn[--Xn], Pn[Xn] = null, rl = Pn[--Xn], Pn[Xn] = null, ol = Pn[--Xn], Pn[Xn] = null;
  }
  function _g(e, t) {
    Pn[Xn++] = ol, Pn[Xn++] = rl, Pn[Xn++] = Ql, ol = t.id, rl = t.overflow, Ql = e;
  }
  var sn = null, Nt = null, at = !1, Zl = null, Kn = !1, hc = Error(i(519));
  function Fl(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw ha(qn(t, e)), hc;
  }
  function kg(e) {
    var t = e.stateNode, l = e.type, o = e.memoizedProps;
    switch (t[Rt] = e, t[an] = o, l) {
      case "dialog":
        nt("cancel", t), nt("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        nt("load", t);
        break;
      case "video":
      case "audio":
        for (l = 0; l < La.length; l++)
          nt(La[l], t);
        break;
      case "source":
        nt("error", t);
        break;
      case "img":
      case "image":
      case "link":
        nt("error", t), nt("load", t);
        break;
      case "details":
        nt("toggle", t);
        break;
      case "input":
        nt("invalid", t), Kp(
          t,
          o.value,
          o.defaultValue,
          o.checked,
          o.defaultChecked,
          o.type,
          o.name,
          !0
        );
        break;
      case "select":
        nt("invalid", t);
        break;
      case "textarea":
        nt("invalid", t), Zp(t, o.value, o.defaultValue, o.children);
    }
    l = o.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || o.suppressHydrationWarning === !0 || Jh(t.textContent, l) ? (o.popover != null && (nt("beforetoggle", t), nt("toggle", t)), o.onScroll != null && nt("scroll", t), o.onScrollEnd != null && nt("scrollend", t), o.onClick != null && (t.onclick = yl), t = !0) : t = !1, t || Fl(e, !0);
  }
  function Hg(e) {
    for (sn = e.return; sn; )
      switch (sn.tag) {
        case 5:
        case 31:
        case 13:
          Kn = !1;
          return;
        case 27:
        case 3:
          Kn = !0;
          return;
        default:
          sn = sn.return;
      }
  }
  function Er(e) {
    if (e !== sn) return !1;
    if (!at) return Hg(e), at = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || Hf(e.type, e.memoizedProps)), l = !l), l && Nt && Fl(e), Hg(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      Nt = ay(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      Nt = ay(e);
    } else
      t === 27 ? (t = Nt, co(e.type) ? (e = If, If = null, Nt = e) : Nt = t) : Nt = sn ? Zn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Ho() {
    Nt = sn = null, at = !1;
  }
  function yc() {
    var e = Zl;
    return e !== null && (En === null ? En = e : En.push.apply(
      En,
      e
    ), Zl = null), e;
  }
  function ha(e) {
    Zl === null ? Zl = [e] : Zl.push(e);
  }
  var bc = E(null), jo = null, Sl = null;
  function Jl(e, t, l) {
    te(bc, t._currentValue), t._currentValue = l;
  }
  function wl(e) {
    e._currentValue = bc.current, H(bc);
  }
  function vc(e, t, l) {
    for (; e !== null; ) {
      var o = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, o !== null && (o.childLanes |= t)) : o !== null && (o.childLanes & t) !== t && (o.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function xc(e, t, l, o) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var u = s.dependencies;
      if (u !== null) {
        var h = s.child;
        u = u.firstContext;
        e: for (; u !== null; ) {
          var w = u;
          u = s;
          for (var U = 0; U < t.length; U++)
            if (w.context === t[U]) {
              u.lanes |= l, w = u.alternate, w !== null && (w.lanes |= l), vc(
                u.return,
                l,
                e
              ), o || (h = null);
              break e;
            }
          u = w.next;
        }
      } else if (s.tag === 18) {
        if (h = s.return, h === null) throw Error(i(341));
        h.lanes |= l, u = h.alternate, u !== null && (u.lanes |= l), vc(h, l, e), h = null;
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
  function Rr(e, t, l, o) {
    e = null;
    for (var s = t, u = !1; s !== null; ) {
      if (!u) {
        if ((s.flags & 524288) !== 0) u = !0;
        else if ((s.flags & 262144) !== 0) break;
      }
      if (s.tag === 10) {
        var h = s.alternate;
        if (h === null) throw Error(i(387));
        if (h = h.memoizedProps, h !== null) {
          var w = s.type;
          zn(s.pendingProps.value, h.value) || (e !== null ? e.push(w) : e = [w]);
        }
      } else if (s === le.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Ga) : e = [Ga]);
      }
      s = s.return;
    }
    e !== null && xc(
      t,
      e,
      l,
      o
    ), t.flags |= 262144;
  }
  function Ui(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!zn(
        e.context._currentValue,
        e.memoizedValue
      ))
        return !0;
      e = e.next;
    }
    return !1;
  }
  function Uo(e) {
    jo = e, Sl = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function un(e) {
    return jg(jo, e);
  }
  function Li(e, t) {
    return jo === null && Uo(e), jg(e, t);
  }
  function jg(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, Sl === null) {
      if (e === null) throw Error(i(308));
      Sl = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else Sl = Sl.next = t;
    return l;
  }
  var MS = typeof AbortController < "u" ? AbortController : function() {
    var e = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(l, o) {
        e.push(o);
      }
    };
    this.abort = function() {
      t.aborted = !0, e.forEach(function(l) {
        return l();
      });
    };
  }, AS = n.unstable_scheduleCallback, zS = n.unstable_NormalPriority, Kt = {
    $$typeof: z,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Sc() {
    return {
      controller: new MS(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function ya(e) {
    e.refCount--, e.refCount === 0 && AS(zS, function() {
      e.controller.abort();
    });
  }
  var ba = null, wc = 0, Tr = 0, Cr = null;
  function DS(e, t) {
    if (ba === null) {
      var l = ba = [];
      wc = 0, Tr = Cf(), Cr = {
        status: "pending",
        value: void 0,
        then: function(o) {
          l.push(o);
        }
      };
    }
    return wc++, t.then(Ug, Ug), t;
  }
  function Ug() {
    if (--wc === 0 && ba !== null) {
      Cr !== null && (Cr.status = "fulfilled");
      var e = ba;
      ba = null, Tr = 0, Cr = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function NS(e, t) {
    var l = [], o = {
      status: "pending",
      value: null,
      reason: null,
      then: function(s) {
        l.push(s);
      }
    };
    return e.then(
      function() {
        o.status = "fulfilled", o.value = t;
        for (var s = 0; s < l.length; s++) (0, l[s])(t);
      },
      function(s) {
        for (o.status = "rejected", o.reason = s, s = 0; s < l.length; s++)
          (0, l[s])(void 0);
      }
    ), o;
  }
  var Lg = N.S;
  N.S = function(e, t) {
    Sh = oe(), typeof t == "object" && t !== null && typeof t.then == "function" && DS(e, t), Lg !== null && Lg(e, t);
  };
  var Lo = E(null);
  function Ec() {
    var e = Lo.current;
    return e !== null ? e : Tt.pooledCache;
  }
  function Bi(e, t) {
    t === null ? te(Lo, Lo.current) : te(Lo, t.pool);
  }
  function Bg() {
    var e = Ec();
    return e === null ? null : { parent: Kt._currentValue, pool: e };
  }
  var Or = Error(i(460)), Rc = Error(i(474)), Ii = Error(i(542)), Vi = { then: function() {
  } };
  function Ig(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function Vg(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(yl, yl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, Gg(e), e;
      default:
        if (typeof t.status == "string") t.then(yl, yl);
        else {
          if (e = Tt, e !== null && 100 < e.shellSuspendCounter)
            throw Error(i(482));
          e = t, e.status = "pending", e.then(
            function(o) {
              if (t.status === "pending") {
                var s = t;
                s.status = "fulfilled", s.value = o;
              }
            },
            function(o) {
              if (t.status === "pending") {
                var s = t;
                s.status = "rejected", s.reason = o;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw e = t.reason, Gg(e), e;
        }
        throw Io = t, Or;
    }
  }
  function Bo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Io = l, Or) : l;
    }
  }
  var Io = null;
  function Yg() {
    if (Io === null) throw Error(i(459));
    var e = Io;
    return Io = null, e;
  }
  function Gg(e) {
    if (e === Or || e === Ii)
      throw Error(i(483));
  }
  var Mr = null, va = 0;
  function Yi(e) {
    var t = va;
    return va += 1, Mr === null && (Mr = []), Vg(Mr, e, t);
  }
  function xa(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function Gi(e, t) {
    throw t.$$typeof === x ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function qg(e) {
    function t(P, V) {
      if (e) {
        var F = P.deletions;
        F === null ? (P.deletions = [V], P.flags |= 16) : F.push(V);
      }
    }
    function l(P, V) {
      if (!e) return null;
      for (; V !== null; )
        t(P, V), V = V.sibling;
      return null;
    }
    function o(P) {
      for (var V = /* @__PURE__ */ new Map(); P !== null; )
        P.key !== null ? V.set(P.key, P) : V.set(P.index, P), P = P.sibling;
      return V;
    }
    function s(P, V) {
      return P = vl(P, V), P.index = 0, P.sibling = null, P;
    }
    function u(P, V, F) {
      return P.index = F, e ? (F = P.alternate, F !== null ? (F = F.index, F < V ? (P.flags |= 67108866, V) : F) : (P.flags |= 67108866, V)) : (P.flags |= 1048576, V);
    }
    function h(P) {
      return e && P.alternate === null && (P.flags |= 67108866), P;
    }
    function w(P, V, F, ce) {
      return V === null || V.tag !== 6 ? (V = dc(F, P.mode, ce), V.return = P, V) : (V = s(V, F), V.return = P, V);
    }
    function U(P, V, F, ce) {
      var Be = F.type;
      return Be === C ? ue(
        P,
        V,
        F.props.children,
        ce,
        F.key
      ) : V !== null && (V.elementType === Be || typeof Be == "object" && Be !== null && Be.$$typeof === _ && Bo(Be) === V.type) ? (V = s(V, F.props), xa(V, F), V.return = P, V) : (V = Hi(
        F.type,
        F.key,
        F.props,
        null,
        P.mode,
        ce
      ), xa(V, F), V.return = P, V);
    }
    function W(P, V, F, ce) {
      return V === null || V.tag !== 4 || V.stateNode.containerInfo !== F.containerInfo || V.stateNode.implementation !== F.implementation ? (V = pc(F, P.mode, ce), V.return = P, V) : (V = s(V, F.children || []), V.return = P, V);
    }
    function ue(P, V, F, ce, Be) {
      return V === null || V.tag !== 7 ? (V = ko(
        F,
        P.mode,
        ce,
        Be
      ), V.return = P, V) : (V = s(V, F), V.return = P, V);
    }
    function de(P, V, F) {
      if (typeof V == "string" && V !== "" || typeof V == "number" || typeof V == "bigint")
        return V = dc(
          "" + V,
          P.mode,
          F
        ), V.return = P, V;
      if (typeof V == "object" && V !== null) {
        switch (V.$$typeof) {
          case T:
            return F = Hi(
              V.type,
              V.key,
              V.props,
              null,
              P.mode,
              F
            ), xa(F, V), F.return = P, F;
          case S:
            return V = pc(
              V,
              P.mode,
              F
            ), V.return = P, V;
          case _:
            return V = Bo(V), de(P, V, F);
        }
        if (G(V) || Q(V))
          return V = ko(
            V,
            P.mode,
            F,
            null
          ), V.return = P, V;
        if (typeof V.then == "function")
          return de(P, Yi(V), F);
        if (V.$$typeof === z)
          return de(
            P,
            Li(P, V),
            F
          );
        Gi(P, V);
      }
      return null;
    }
    function $(P, V, F, ce) {
      var Be = V !== null ? V.key : null;
      if (typeof F == "string" && F !== "" || typeof F == "number" || typeof F == "bigint")
        return Be !== null ? null : w(P, V, "" + F, ce);
      if (typeof F == "object" && F !== null) {
        switch (F.$$typeof) {
          case T:
            return F.key === Be ? U(P, V, F, ce) : null;
          case S:
            return F.key === Be ? W(P, V, F, ce) : null;
          case _:
            return F = Bo(F), $(P, V, F, ce);
        }
        if (G(F) || Q(F))
          return Be !== null ? null : ue(P, V, F, ce, null);
        if (typeof F.then == "function")
          return $(
            P,
            V,
            Yi(F),
            ce
          );
        if (F.$$typeof === z)
          return $(
            P,
            V,
            Li(P, F),
            ce
          );
        Gi(P, F);
      }
      return null;
    }
    function ne(P, V, F, ce, Be) {
      if (typeof ce == "string" && ce !== "" || typeof ce == "number" || typeof ce == "bigint")
        return P = P.get(F) || null, w(V, P, "" + ce, Be);
      if (typeof ce == "object" && ce !== null) {
        switch (ce.$$typeof) {
          case T:
            return P = P.get(
              ce.key === null ? F : ce.key
            ) || null, U(V, P, ce, Be);
          case S:
            return P = P.get(
              ce.key === null ? F : ce.key
            ) || null, W(V, P, ce, Be);
          case _:
            return ce = Bo(ce), ne(
              P,
              V,
              F,
              ce,
              Be
            );
        }
        if (G(ce) || Q(ce))
          return P = P.get(F) || null, ue(V, P, ce, Be, null);
        if (typeof ce.then == "function")
          return ne(
            P,
            V,
            F,
            Yi(ce),
            Be
          );
        if (ce.$$typeof === z)
          return ne(
            P,
            V,
            F,
            Li(V, ce),
            Be
          );
        Gi(V, ce);
      }
      return null;
    }
    function ze(P, V, F, ce) {
      for (var Be = null, ut = null, Ne = V, Ke = V = 0, rt = null; Ne !== null && Ke < F.length; Ke++) {
        Ne.index > Ke ? (rt = Ne, Ne = null) : rt = Ne.sibling;
        var ct = $(
          P,
          Ne,
          F[Ke],
          ce
        );
        if (ct === null) {
          Ne === null && (Ne = rt);
          break;
        }
        e && Ne && ct.alternate === null && t(P, Ne), V = u(ct, V, Ke), ut === null ? Be = ct : ut.sibling = ct, ut = ct, Ne = rt;
      }
      if (Ke === F.length)
        return l(P, Ne), at && xl(P, Ke), Be;
      if (Ne === null) {
        for (; Ke < F.length; Ke++)
          Ne = de(P, F[Ke], ce), Ne !== null && (V = u(
            Ne,
            V,
            Ke
          ), ut === null ? Be = Ne : ut.sibling = Ne, ut = Ne);
        return at && xl(P, Ke), Be;
      }
      for (Ne = o(Ne); Ke < F.length; Ke++)
        rt = ne(
          Ne,
          P,
          Ke,
          F[Ke],
          ce
        ), rt !== null && (e && rt.alternate !== null && Ne.delete(
          rt.key === null ? Ke : rt.key
        ), V = u(
          rt,
          V,
          Ke
        ), ut === null ? Be = rt : ut.sibling = rt, ut = rt);
      return e && Ne.forEach(function(ho) {
        return t(P, ho);
      }), at && xl(P, Ke), Be;
    }
    function Ve(P, V, F, ce) {
      if (F == null) throw Error(i(151));
      for (var Be = null, ut = null, Ne = V, Ke = V = 0, rt = null, ct = F.next(); Ne !== null && !ct.done; Ke++, ct = F.next()) {
        Ne.index > Ke ? (rt = Ne, Ne = null) : rt = Ne.sibling;
        var ho = $(P, Ne, ct.value, ce);
        if (ho === null) {
          Ne === null && (Ne = rt);
          break;
        }
        e && Ne && ho.alternate === null && t(P, Ne), V = u(ho, V, Ke), ut === null ? Be = ho : ut.sibling = ho, ut = ho, Ne = rt;
      }
      if (ct.done)
        return l(P, Ne), at && xl(P, Ke), Be;
      if (Ne === null) {
        for (; !ct.done; Ke++, ct = F.next())
          ct = de(P, ct.value, ce), ct !== null && (V = u(ct, V, Ke), ut === null ? Be = ct : ut.sibling = ct, ut = ct);
        return at && xl(P, Ke), Be;
      }
      for (Ne = o(Ne); !ct.done; Ke++, ct = F.next())
        ct = ne(Ne, P, Ke, ct.value, ce), ct !== null && (e && ct.alternate !== null && Ne.delete(ct.key === null ? Ke : ct.key), V = u(ct, V, Ke), ut === null ? Be = ct : ut.sibling = ct, ut = ct);
      return e && Ne.forEach(function(Gw) {
        return t(P, Gw);
      }), at && xl(P, Ke), Be;
    }
    function St(P, V, F, ce) {
      if (typeof F == "object" && F !== null && F.type === C && F.key === null && (F = F.props.children), typeof F == "object" && F !== null) {
        switch (F.$$typeof) {
          case T:
            e: {
              for (var Be = F.key; V !== null; ) {
                if (V.key === Be) {
                  if (Be = F.type, Be === C) {
                    if (V.tag === 7) {
                      l(
                        P,
                        V.sibling
                      ), ce = s(
                        V,
                        F.props.children
                      ), ce.return = P, P = ce;
                      break e;
                    }
                  } else if (V.elementType === Be || typeof Be == "object" && Be !== null && Be.$$typeof === _ && Bo(Be) === V.type) {
                    l(
                      P,
                      V.sibling
                    ), ce = s(V, F.props), xa(ce, F), ce.return = P, P = ce;
                    break e;
                  }
                  l(P, V);
                  break;
                } else t(P, V);
                V = V.sibling;
              }
              F.type === C ? (ce = ko(
                F.props.children,
                P.mode,
                ce,
                F.key
              ), ce.return = P, P = ce) : (ce = Hi(
                F.type,
                F.key,
                F.props,
                null,
                P.mode,
                ce
              ), xa(ce, F), ce.return = P, P = ce);
            }
            return h(P);
          case S:
            e: {
              for (Be = F.key; V !== null; ) {
                if (V.key === Be)
                  if (V.tag === 4 && V.stateNode.containerInfo === F.containerInfo && V.stateNode.implementation === F.implementation) {
                    l(
                      P,
                      V.sibling
                    ), ce = s(V, F.children || []), ce.return = P, P = ce;
                    break e;
                  } else {
                    l(P, V);
                    break;
                  }
                else t(P, V);
                V = V.sibling;
              }
              ce = pc(F, P.mode, ce), ce.return = P, P = ce;
            }
            return h(P);
          case _:
            return F = Bo(F), St(
              P,
              V,
              F,
              ce
            );
        }
        if (G(F))
          return ze(
            P,
            V,
            F,
            ce
          );
        if (Q(F)) {
          if (Be = Q(F), typeof Be != "function") throw Error(i(150));
          return F = Be.call(F), Ve(
            P,
            V,
            F,
            ce
          );
        }
        if (typeof F.then == "function")
          return St(
            P,
            V,
            Yi(F),
            ce
          );
        if (F.$$typeof === z)
          return St(
            P,
            V,
            Li(P, F),
            ce
          );
        Gi(P, F);
      }
      return typeof F == "string" && F !== "" || typeof F == "number" || typeof F == "bigint" ? (F = "" + F, V !== null && V.tag === 6 ? (l(P, V.sibling), ce = s(V, F), ce.return = P, P = ce) : (l(P, V), ce = dc(F, P.mode, ce), ce.return = P, P = ce), h(P)) : l(P, V);
    }
    return function(P, V, F, ce) {
      try {
        va = 0;
        var Be = St(
          P,
          V,
          F,
          ce
        );
        return Mr = null, Be;
      } catch (Ne) {
        if (Ne === Or || Ne === Ii) throw Ne;
        var ut = Dn(29, Ne, null, P.mode);
        return ut.lanes = ce, ut.return = P, ut;
      }
    };
  }
  var Vo = qg(!0), Pg = qg(!1), Wl = !1;
  function Tc(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function Cc(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
      baseState: e.baseState,
      firstBaseUpdate: e.firstBaseUpdate,
      lastBaseUpdate: e.lastBaseUpdate,
      shared: e.shared,
      callbacks: null
    });
  }
  function $l(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function eo(e, t, l) {
    var o = e.updateQueue;
    if (o === null) return null;
    if (o = o.shared, (dt & 2) !== 0) {
      var s = o.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), o.pending = t, t = ki(e), Mg(e, null, l), t;
    }
    return _i(e, o, t, l), ki(e);
  }
  function Sa(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var o = t.lanes;
      o &= e.pendingLanes, l |= o, t.lanes = l, Wn(e, l);
    }
  }
  function Oc(e, t) {
    var l = e.updateQueue, o = e.alternate;
    if (o !== null && (o = o.updateQueue, l === o)) {
      var s = null, u = null;
      if (l = l.firstBaseUpdate, l !== null) {
        do {
          var h = {
            lane: l.lane,
            tag: l.tag,
            payload: l.payload,
            callback: null,
            next: null
          };
          u === null ? s = u = h : u = u.next = h, l = l.next;
        } while (l !== null);
        u === null ? s = u = t : u = u.next = t;
      } else s = u = t;
      l = {
        baseState: o.baseState,
        firstBaseUpdate: s,
        lastBaseUpdate: u,
        shared: o.shared,
        callbacks: o.callbacks
      }, e.updateQueue = l;
      return;
    }
    e = l.lastBaseUpdate, e === null ? l.firstBaseUpdate = t : e.next = t, l.lastBaseUpdate = t;
  }
  var Mc = !1;
  function wa() {
    if (Mc) {
      var e = Cr;
      if (e !== null) throw e;
    }
  }
  function Ea(e, t, l, o) {
    Mc = !1;
    var s = e.updateQueue;
    Wl = !1;
    var u = s.firstBaseUpdate, h = s.lastBaseUpdate, w = s.shared.pending;
    if (w !== null) {
      s.shared.pending = null;
      var U = w, W = U.next;
      U.next = null, h === null ? u = W : h.next = W, h = U;
      var ue = e.alternate;
      ue !== null && (ue = ue.updateQueue, w = ue.lastBaseUpdate, w !== h && (w === null ? ue.firstBaseUpdate = W : w.next = W, ue.lastBaseUpdate = U));
    }
    if (u !== null) {
      var de = s.baseState;
      h = 0, ue = W = U = null, w = u;
      do {
        var $ = w.lane & -536870913, ne = $ !== w.lane;
        if (ne ? (ot & $) === $ : (o & $) === $) {
          $ !== 0 && $ === Tr && (Mc = !0), ue !== null && (ue = ue.next = {
            lane: 0,
            tag: w.tag,
            payload: w.payload,
            callback: null,
            next: null
          });
          e: {
            var ze = e, Ve = w;
            $ = t;
            var St = l;
            switch (Ve.tag) {
              case 1:
                if (ze = Ve.payload, typeof ze == "function") {
                  de = ze.call(St, de, $);
                  break e;
                }
                de = ze;
                break e;
              case 3:
                ze.flags = ze.flags & -65537 | 128;
              case 0:
                if (ze = Ve.payload, $ = typeof ze == "function" ? ze.call(St, de, $) : ze, $ == null) break e;
                de = v({}, de, $);
                break e;
              case 2:
                Wl = !0;
            }
          }
          $ = w.callback, $ !== null && (e.flags |= 64, ne && (e.flags |= 8192), ne = s.callbacks, ne === null ? s.callbacks = [$] : ne.push($));
        } else
          ne = {
            lane: $,
            tag: w.tag,
            payload: w.payload,
            callback: w.callback,
            next: null
          }, ue === null ? (W = ue = ne, U = de) : ue = ue.next = ne, h |= $;
        if (w = w.next, w === null) {
          if (w = s.shared.pending, w === null)
            break;
          ne = w, w = ne.next, ne.next = null, s.lastBaseUpdate = ne, s.shared.pending = null;
        }
      } while (!0);
      ue === null && (U = de), s.baseState = U, s.firstBaseUpdate = W, s.lastBaseUpdate = ue, u === null && (s.shared.lanes = 0), ro |= h, e.lanes = h, e.memoizedState = de;
    }
  }
  function Xg(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function Kg(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        Xg(l[e], t);
  }
  var Ar = E(null), qi = E(0);
  function Qg(e, t) {
    e = Dl, te(qi, e), te(Ar, t), Dl = e | t.baseLanes;
  }
  function Ac() {
    te(qi, Dl), te(Ar, Ar.current);
  }
  function zc() {
    Dl = qi.current, H(Ar), H(qi);
  }
  var Nn = E(null), Qn = null;
  function to(e) {
    var t = e.alternate;
    te(Pt, Pt.current & 1), te(Nn, e), Qn === null && (t === null || Ar.current !== null || t.memoizedState !== null) && (Qn = e);
  }
  function Dc(e) {
    te(Pt, Pt.current), te(Nn, e), Qn === null && (Qn = e);
  }
  function Zg(e) {
    e.tag === 22 ? (te(Pt, Pt.current), te(Nn, e), Qn === null && (Qn = e)) : no();
  }
  function no() {
    te(Pt, Pt.current), te(Nn, Nn.current);
  }
  function _n(e) {
    H(Nn), Qn === e && (Qn = null), H(Pt);
  }
  var Pt = E(0);
  function Pi(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || Lf(l) || Bf(l)))
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
  var El = 0, Xe = null, vt = null, Qt = null, Xi = !1, zr = !1, Yo = !1, Ki = 0, Ra = 0, Dr = null, _S = 0;
  function Bt() {
    throw Error(i(321));
  }
  function Nc(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!zn(e[l], t[l])) return !1;
    return !0;
  }
  function _c(e, t, l, o, s, u) {
    return El = u, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, N.H = e === null || e.memoizedState === null ? Nm : Qc, Yo = !1, u = l(o, s), Yo = !1, zr && (u = Jg(
      t,
      l,
      o,
      s
    )), Fg(e), u;
  }
  function Fg(e) {
    N.H = Oa;
    var t = vt !== null && vt.next !== null;
    if (El = 0, Qt = vt = Xe = null, Xi = !1, Ra = 0, Dr = null, t) throw Error(i(300));
    e === null || Zt || (e = e.dependencies, e !== null && Ui(e) && (Zt = !0));
  }
  function Jg(e, t, l, o) {
    Xe = e;
    var s = 0;
    do {
      if (zr && (Dr = null), Ra = 0, zr = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Qt = vt = null, e.updateQueue != null) {
        var u = e.updateQueue;
        u.lastEffect = null, u.events = null, u.stores = null, u.memoCache != null && (u.memoCache.index = 0);
      }
      N.H = _m, u = t(l, o);
    } while (zr);
    return u;
  }
  function kS() {
    var e = N.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Ta(t) : t, e = e.useState()[0], (vt !== null ? vt.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function kc() {
    var e = Ki !== 0;
    return Ki = 0, e;
  }
  function Hc(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function jc(e) {
    if (Xi) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      Xi = !1;
    }
    El = 0, Qt = vt = Xe = null, zr = !1, Ra = Ki = 0, Dr = null;
  }
  function mn() {
    var e = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Qt === null ? Xe.memoizedState = Qt = e : Qt = Qt.next = e, Qt;
  }
  function Xt() {
    if (vt === null) {
      var e = Xe.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = vt.next;
    var t = Qt === null ? Xe.memoizedState : Qt.next;
    if (t !== null)
      Qt = t, vt = e;
    else {
      if (e === null)
        throw Xe.alternate === null ? Error(i(467)) : Error(i(310));
      vt = e, e = {
        memoizedState: vt.memoizedState,
        baseState: vt.baseState,
        baseQueue: vt.baseQueue,
        queue: vt.queue,
        next: null
      }, Qt === null ? Xe.memoizedState = Qt = e : Qt = Qt.next = e;
    }
    return Qt;
  }
  function Qi() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Ta(e) {
    var t = Ra;
    return Ra += 1, Dr === null && (Dr = []), e = Vg(Dr, e, t), t = Xe, (Qt === null ? t.memoizedState : Qt.next) === null && (t = t.alternate, N.H = t === null || t.memoizedState === null ? Nm : Qc), e;
  }
  function Zi(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Ta(e);
      if (e.$$typeof === z) return un(e);
    }
    throw Error(i(438, String(e)));
  }
  function Uc(e) {
    var t = null, l = Xe.updateQueue;
    if (l !== null && (t = l.memoCache), t == null) {
      var o = Xe.alternate;
      o !== null && (o = o.updateQueue, o !== null && (o = o.memoCache, o != null && (t = {
        data: o.data.map(function(s) {
          return s.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), l === null && (l = Qi(), Xe.updateQueue = l), l.memoCache = t, l = t.data[t.index], l === void 0)
      for (l = t.data[t.index] = Array(e), o = 0; o < e; o++)
        l[o] = q;
    return t.index++, l;
  }
  function Rl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Fi(e) {
    var t = Xt();
    return Lc(t, vt, e);
  }
  function Lc(e, t, l) {
    var o = e.queue;
    if (o === null) throw Error(i(311));
    o.lastRenderedReducer = l;
    var s = e.baseQueue, u = o.pending;
    if (u !== null) {
      if (s !== null) {
        var h = s.next;
        s.next = u.next, u.next = h;
      }
      t.baseQueue = s = u, o.pending = null;
    }
    if (u = e.baseState, s === null) e.memoizedState = u;
    else {
      t = s.next;
      var w = h = null, U = null, W = t, ue = !1;
      do {
        var de = W.lane & -536870913;
        if (de !== W.lane ? (ot & de) === de : (El & de) === de) {
          var $ = W.revertLane;
          if ($ === 0)
            U !== null && (U = U.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: W.action,
              hasEagerState: W.hasEagerState,
              eagerState: W.eagerState,
              next: null
            }), de === Tr && (ue = !0);
          else if ((El & $) === $) {
            W = W.next, $ === Tr && (ue = !0);
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
            }, U === null ? (w = U = de, h = u) : U = U.next = de, Xe.lanes |= $, ro |= $;
          de = W.action, Yo && l(u, de), u = W.hasEagerState ? W.eagerState : l(u, de);
        } else
          $ = {
            lane: de,
            revertLane: W.revertLane,
            gesture: W.gesture,
            action: W.action,
            hasEagerState: W.hasEagerState,
            eagerState: W.eagerState,
            next: null
          }, U === null ? (w = U = $, h = u) : U = U.next = $, Xe.lanes |= de, ro |= de;
        W = W.next;
      } while (W !== null && W !== t);
      if (U === null ? h = u : U.next = w, !zn(u, e.memoizedState) && (Zt = !0, ue && (l = Cr, l !== null)))
        throw l;
      e.memoizedState = u, e.baseState = h, e.baseQueue = U, o.lastRenderedState = u;
    }
    return s === null && (o.lanes = 0), [e.memoizedState, o.dispatch];
  }
  function Bc(e) {
    var t = Xt(), l = t.queue;
    if (l === null) throw Error(i(311));
    l.lastRenderedReducer = e;
    var o = l.dispatch, s = l.pending, u = t.memoizedState;
    if (s !== null) {
      l.pending = null;
      var h = s = s.next;
      do
        u = e(u, h.action), h = h.next;
      while (h !== s);
      zn(u, t.memoizedState) || (Zt = !0), t.memoizedState = u, t.baseQueue === null && (t.baseState = u), l.lastRenderedState = u;
    }
    return [u, o];
  }
  function Wg(e, t, l) {
    var o = Xe, s = Xt(), u = at;
    if (u) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var h = !zn(
      (vt || s).memoizedState,
      l
    );
    if (h && (s.memoizedState = l, Zt = !0), s = s.queue, Yc(tm.bind(null, o, s, e), [
      e
    ]), s.getSnapshot !== t || h || Qt !== null && Qt.memoizedState.tag & 1) {
      if (o.flags |= 2048, Nr(
        9,
        { destroy: void 0 },
        em.bind(
          null,
          o,
          s,
          l,
          t
        ),
        null
      ), Tt === null) throw Error(i(349));
      u || (El & 127) !== 0 || $g(o, t, l);
    }
    return l;
  }
  function $g(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = Qi(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function em(e, t, l, o) {
    t.value = l, t.getSnapshot = o, nm(t) && lm(e);
  }
  function tm(e, t, l) {
    return l(function() {
      nm(t) && lm(e);
    });
  }
  function nm(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !zn(e, l);
    } catch {
      return !0;
    }
  }
  function lm(e) {
    var t = _o(e, 2);
    t !== null && Rn(t, e, 2);
  }
  function Ic(e) {
    var t = mn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Yo) {
        Mt(!0);
        try {
          l();
        } finally {
          Mt(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = e, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Rl,
      lastRenderedState: e
    }, t;
  }
  function om(e, t, l, o) {
    return e.baseState = l, Lc(
      e,
      vt,
      typeof o == "function" ? o : Rl
    );
  }
  function HS(e, t, l, o, s) {
    if ($i(e)) throw Error(i(485));
    if (e = t.action, e !== null) {
      var u = {
        payload: s,
        action: e,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(h) {
          u.listeners.push(h);
        }
      };
      N.T !== null ? l(!0) : u.isTransition = !1, o(u), l = t.pending, l === null ? (u.next = t.pending = u, rm(t, u)) : (u.next = l.next, t.pending = l.next = u);
    }
  }
  function rm(e, t) {
    var l = t.action, o = t.payload, s = e.state;
    if (t.isTransition) {
      var u = N.T, h = {};
      N.T = h;
      try {
        var w = l(s, o), U = N.S;
        U !== null && U(h, w), am(e, t, w);
      } catch (W) {
        Vc(e, t, W);
      } finally {
        u !== null && h.types !== null && (u.types = h.types), N.T = u;
      }
    } else
      try {
        u = l(s, o), am(e, t, u);
      } catch (W) {
        Vc(e, t, W);
      }
  }
  function am(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(o) {
        im(e, t, o);
      },
      function(o) {
        return Vc(e, t, o);
      }
    ) : im(e, t, l);
  }
  function im(e, t, l) {
    t.status = "fulfilled", t.value = l, sm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, rm(e, l)));
  }
  function Vc(e, t, l) {
    var o = e.pending;
    if (e.pending = null, o !== null) {
      o = o.next;
      do
        t.status = "rejected", t.reason = l, sm(t), t = t.next;
      while (t !== o);
    }
    e.action = null;
  }
  function sm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function um(e, t) {
    return t;
  }
  function cm(e, t) {
    if (at) {
      var l = Tt.formState;
      if (l !== null) {
        e: {
          var o = Xe;
          if (at) {
            if (Nt) {
              t: {
                for (var s = Nt, u = Kn; s.nodeType !== 8; ) {
                  if (!u) {
                    s = null;
                    break t;
                  }
                  if (s = Zn(
                    s.nextSibling
                  ), s === null) {
                    s = null;
                    break t;
                  }
                }
                u = s.data, s = u === "F!" || u === "F" ? s : null;
              }
              if (s) {
                Nt = Zn(
                  s.nextSibling
                ), o = s.data === "F!";
                break e;
              }
            }
            Fl(o);
          }
          o = !1;
        }
        o && (t = l[0]);
      }
    }
    return l = mn(), l.memoizedState = l.baseState = t, o = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: um,
      lastRenderedState: t
    }, l.queue = o, l = Am.bind(
      null,
      Xe,
      o
    ), o.dispatch = l, o = Ic(!1), u = Kc.bind(
      null,
      Xe,
      !1,
      o.queue
    ), o = mn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, o.queue = s, l = HS.bind(
      null,
      Xe,
      s,
      u,
      l
    ), s.dispatch = l, o.memoizedState = e, [t, l, !1];
  }
  function fm(e) {
    var t = Xt();
    return dm(t, vt, e);
  }
  function dm(e, t, l) {
    if (t = Lc(
      e,
      t,
      um
    )[0], e = Fi(Rl)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var o = Ta(t);
      } catch (h) {
        throw h === Or ? Ii : h;
      }
    else o = t;
    t = Xt();
    var s = t.queue, u = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Nr(
      9,
      { destroy: void 0 },
      jS.bind(null, s, l),
      null
    )), [o, u, e];
  }
  function jS(e, t) {
    e.action = t;
  }
  function pm(e) {
    var t = Xt(), l = vt;
    if (l !== null)
      return dm(t, l, e);
    Xt(), t = t.memoizedState, l = Xt();
    var o = l.queue.dispatch;
    return l.memoizedState = e, [t, o, !1];
  }
  function Nr(e, t, l, o) {
    return e = { tag: e, create: l, deps: o, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = Qi(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (o = l.next, l.next = e, e.next = o, t.lastEffect = e), e;
  }
  function gm() {
    return Xt().memoizedState;
  }
  function Ji(e, t, l, o) {
    var s = mn();
    Xe.flags |= e, s.memoizedState = Nr(
      1 | t,
      { destroy: void 0 },
      l,
      o === void 0 ? null : o
    );
  }
  function Wi(e, t, l, o) {
    var s = Xt();
    o = o === void 0 ? null : o;
    var u = s.memoizedState.inst;
    vt !== null && o !== null && Nc(o, vt.memoizedState.deps) ? s.memoizedState = Nr(t, u, l, o) : (Xe.flags |= e, s.memoizedState = Nr(
      1 | t,
      u,
      l,
      o
    ));
  }
  function mm(e, t) {
    Ji(8390656, 8, e, t);
  }
  function Yc(e, t) {
    Wi(2048, 8, e, t);
  }
  function US(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = Qi(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function hm(e) {
    var t = Xt().memoizedState;
    return US({ ref: t, nextImpl: e }), function() {
      if ((dt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function ym(e, t) {
    return Wi(4, 2, e, t);
  }
  function bm(e, t) {
    return Wi(4, 4, e, t);
  }
  function vm(e, t) {
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
  function xm(e, t, l) {
    l = l != null ? l.concat([e]) : null, Wi(4, 4, vm.bind(null, t, e), l);
  }
  function Gc() {
  }
  function Sm(e, t) {
    var l = Xt();
    t = t === void 0 ? null : t;
    var o = l.memoizedState;
    return t !== null && Nc(t, o[1]) ? o[0] : (l.memoizedState = [e, t], e);
  }
  function wm(e, t) {
    var l = Xt();
    t = t === void 0 ? null : t;
    var o = l.memoizedState;
    if (t !== null && Nc(t, o[1]))
      return o[0];
    if (o = e(), Yo) {
      Mt(!0);
      try {
        e();
      } finally {
        Mt(!1);
      }
    }
    return l.memoizedState = [o, t], o;
  }
  function qc(e, t, l) {
    return l === void 0 || (El & 1073741824) !== 0 && (ot & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = Eh(), Xe.lanes |= e, ro |= e, l);
  }
  function Em(e, t, l, o) {
    return zn(l, t) ? l : Ar.current !== null ? (e = qc(e, l, o), zn(e, t) || (Zt = !0), e) : (El & 42) === 0 || (El & 1073741824) !== 0 && (ot & 261930) === 0 ? (Zt = !0, e.memoizedState = l) : (e = Eh(), Xe.lanes |= e, ro |= e, t);
  }
  function Rm(e, t, l, o, s) {
    var u = Y.p;
    Y.p = u !== 0 && 8 > u ? u : 8;
    var h = N.T, w = {};
    N.T = w, Kc(e, !1, t, l);
    try {
      var U = s(), W = N.S;
      if (W !== null && W(w, U), U !== null && typeof U == "object" && typeof U.then == "function") {
        var ue = NS(
          U,
          o
        );
        Ca(
          e,
          t,
          ue,
          jn(e)
        );
      } else
        Ca(
          e,
          t,
          o,
          jn(e)
        );
    } catch (de) {
      Ca(
        e,
        t,
        { then: function() {
        }, status: "rejected", reason: de },
        jn()
      );
    } finally {
      Y.p = u, h !== null && w.types !== null && (h.types = w.types), N.T = h;
    }
  }
  function LS() {
  }
  function Pc(e, t, l, o) {
    if (e.tag !== 5) throw Error(i(476));
    var s = Tm(e).queue;
    Rm(
      e,
      s,
      t,
      I,
      l === null ? LS : function() {
        return Cm(e), l(o);
      }
    );
  }
  function Tm(e) {
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
        lastRenderedReducer: Rl,
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
        lastRenderedReducer: Rl,
        lastRenderedState: l
      },
      next: null
    }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function Cm(e) {
    var t = Tm(e);
    t.next === null && (t = e.alternate.memoizedState), Ca(
      e,
      t.next.queue,
      {},
      jn()
    );
  }
  function Xc() {
    return un(Ga);
  }
  function Om() {
    return Xt().memoizedState;
  }
  function Mm() {
    return Xt().memoizedState;
  }
  function BS(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = jn();
          e = $l(l);
          var o = eo(t, e, l);
          o !== null && (Rn(o, t, l), Sa(o, t, l)), t = { cache: Sc() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function IS(e, t, l) {
    var o = jn();
    l = {
      lane: o,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, $i(e) ? zm(t, l) : (l = cc(e, t, l, o), l !== null && (Rn(l, e, o), Dm(l, t, o)));
  }
  function Am(e, t, l) {
    var o = jn();
    Ca(e, t, l, o);
  }
  function Ca(e, t, l, o) {
    var s = {
      lane: o,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if ($i(e)) zm(t, s);
    else {
      var u = e.alternate;
      if (e.lanes === 0 && (u === null || u.lanes === 0) && (u = t.lastRenderedReducer, u !== null))
        try {
          var h = t.lastRenderedState, w = u(h, l);
          if (s.hasEagerState = !0, s.eagerState = w, zn(w, h))
            return _i(e, t, s, 0), Tt === null && Ni(), !1;
        } catch {
        }
      if (l = cc(e, t, s, o), l !== null)
        return Rn(l, e, o), Dm(l, t, o), !0;
    }
    return !1;
  }
  function Kc(e, t, l, o) {
    if (o = {
      lane: 2,
      revertLane: Cf(),
      gesture: null,
      action: o,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, $i(e)) {
      if (t) throw Error(i(479));
    } else
      t = cc(
        e,
        l,
        o,
        2
      ), t !== null && Rn(t, e, 2);
  }
  function $i(e) {
    var t = e.alternate;
    return e === Xe || t !== null && t === Xe;
  }
  function zm(e, t) {
    zr = Xi = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function Dm(e, t, l) {
    if ((l & 4194048) !== 0) {
      var o = t.lanes;
      o &= e.pendingLanes, l |= o, t.lanes = l, Wn(e, l);
    }
  }
  var Oa = {
    readContext: un,
    use: Zi,
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
  Oa.useEffectEvent = Bt;
  var Nm = {
    readContext: un,
    use: Zi,
    useCallback: function(e, t) {
      return mn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: un,
    useEffect: mm,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, Ji(
        4194308,
        4,
        vm.bind(null, t, e),
        l
      );
    },
    useLayoutEffect: function(e, t) {
      return Ji(4194308, 4, e, t);
    },
    useInsertionEffect: function(e, t) {
      Ji(4, 2, e, t);
    },
    useMemo: function(e, t) {
      var l = mn();
      t = t === void 0 ? null : t;
      var o = e();
      if (Yo) {
        Mt(!0);
        try {
          e();
        } finally {
          Mt(!1);
        }
      }
      return l.memoizedState = [o, t], o;
    },
    useReducer: function(e, t, l) {
      var o = mn();
      if (l !== void 0) {
        var s = l(t);
        if (Yo) {
          Mt(!0);
          try {
            l(t);
          } finally {
            Mt(!1);
          }
        }
      } else s = t;
      return o.memoizedState = o.baseState = s, e = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: e,
        lastRenderedState: s
      }, o.queue = e, e = e.dispatch = IS.bind(
        null,
        Xe,
        e
      ), [o.memoizedState, e];
    },
    useRef: function(e) {
      var t = mn();
      return e = { current: e }, t.memoizedState = e;
    },
    useState: function(e) {
      e = Ic(e);
      var t = e.queue, l = Am.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: Gc,
    useDeferredValue: function(e, t) {
      var l = mn();
      return qc(l, e, t);
    },
    useTransition: function() {
      var e = Ic(!1);
      return e = Rm.bind(
        null,
        Xe,
        e.queue,
        !0,
        !1
      ), mn().memoizedState = e, [!1, e];
    },
    useSyncExternalStore: function(e, t, l) {
      var o = Xe, s = mn();
      if (at) {
        if (l === void 0)
          throw Error(i(407));
        l = l();
      } else {
        if (l = t(), Tt === null)
          throw Error(i(349));
        (ot & 127) !== 0 || $g(o, t, l);
      }
      s.memoizedState = l;
      var u = { value: l, getSnapshot: t };
      return s.queue = u, mm(tm.bind(null, o, u, e), [
        e
      ]), o.flags |= 2048, Nr(
        9,
        { destroy: void 0 },
        em.bind(
          null,
          o,
          u,
          l,
          t
        ),
        null
      ), l;
    },
    useId: function() {
      var e = mn(), t = Tt.identifierPrefix;
      if (at) {
        var l = rl, o = ol;
        l = (o & ~(1 << 32 - mt(o) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = Ki++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = _S++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: Xc,
    useFormState: cm,
    useActionState: cm,
    useOptimistic: function(e) {
      var t = mn();
      t.memoizedState = t.baseState = e;
      var l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = l, t = Kc.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: Uc,
    useCacheRefresh: function() {
      return mn().memoizedState = BS.bind(
        null,
        Xe
      );
    },
    useEffectEvent: function(e) {
      var t = mn(), l = { impl: e };
      return t.memoizedState = l, function() {
        if ((dt & 2) !== 0)
          throw Error(i(440));
        return l.impl.apply(void 0, arguments);
      };
    }
  }, Qc = {
    readContext: un,
    use: Zi,
    useCallback: Sm,
    useContext: un,
    useEffect: Yc,
    useImperativeHandle: xm,
    useInsertionEffect: ym,
    useLayoutEffect: bm,
    useMemo: wm,
    useReducer: Fi,
    useRef: gm,
    useState: function() {
      return Fi(Rl);
    },
    useDebugValue: Gc,
    useDeferredValue: function(e, t) {
      var l = Xt();
      return Em(
        l,
        vt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = Fi(Rl)[0], t = Xt().memoizedState;
      return [
        typeof e == "boolean" ? e : Ta(e),
        t
      ];
    },
    useSyncExternalStore: Wg,
    useId: Om,
    useHostTransitionStatus: Xc,
    useFormState: fm,
    useActionState: fm,
    useOptimistic: function(e, t) {
      var l = Xt();
      return om(l, vt, e, t);
    },
    useMemoCache: Uc,
    useCacheRefresh: Mm
  };
  Qc.useEffectEvent = hm;
  var _m = {
    readContext: un,
    use: Zi,
    useCallback: Sm,
    useContext: un,
    useEffect: Yc,
    useImperativeHandle: xm,
    useInsertionEffect: ym,
    useLayoutEffect: bm,
    useMemo: wm,
    useReducer: Bc,
    useRef: gm,
    useState: function() {
      return Bc(Rl);
    },
    useDebugValue: Gc,
    useDeferredValue: function(e, t) {
      var l = Xt();
      return vt === null ? qc(l, e, t) : Em(
        l,
        vt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = Bc(Rl)[0], t = Xt().memoizedState;
      return [
        typeof e == "boolean" ? e : Ta(e),
        t
      ];
    },
    useSyncExternalStore: Wg,
    useId: Om,
    useHostTransitionStatus: Xc,
    useFormState: pm,
    useActionState: pm,
    useOptimistic: function(e, t) {
      var l = Xt();
      return vt !== null ? om(l, vt, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: Uc,
    useCacheRefresh: Mm
  };
  _m.useEffectEvent = hm;
  function Zc(e, t, l, o) {
    t = e.memoizedState, l = l(o, t), l = l == null ? t : v({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var Fc = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var o = jn(), s = $l(o);
      s.payload = t, l != null && (s.callback = l), t = eo(e, s, o), t !== null && (Rn(t, e, o), Sa(t, e, o));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var o = jn(), s = $l(o);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = eo(e, s, o), t !== null && (Rn(t, e, o), Sa(t, e, o));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = jn(), o = $l(l);
      o.tag = 2, t != null && (o.callback = t), t = eo(e, o, l), t !== null && (Rn(t, e, l), Sa(t, e, l));
    }
  };
  function km(e, t, l, o, s, u, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(o, u, h) : t.prototype && t.prototype.isPureReactComponent ? !pa(l, o) || !pa(s, u) : !0;
  }
  function Hm(e, t, l, o) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, o), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, o), t.state !== e && Fc.enqueueReplaceState(t, t.state, null);
  }
  function Go(e, t) {
    var l = t;
    if ("ref" in t) {
      l = {};
      for (var o in t)
        o !== "ref" && (l[o] = t[o]);
    }
    if (e = e.defaultProps) {
      l === t && (l = v({}, l));
      for (var s in e)
        l[s] === void 0 && (l[s] = e[s]);
    }
    return l;
  }
  function jm(e) {
    Di(e);
  }
  function Um(e) {
    console.error(e);
  }
  function Lm(e) {
    Di(e);
  }
  function es(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (o) {
      setTimeout(function() {
        throw o;
      });
    }
  }
  function Bm(e, t, l) {
    try {
      var o = e.onCaughtError;
      o(l.value, {
        componentStack: l.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (s) {
      setTimeout(function() {
        throw s;
      });
    }
  }
  function Jc(e, t, l) {
    return l = $l(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      es(e, t);
    }, l;
  }
  function Im(e) {
    return e = $l(e), e.tag = 3, e;
  }
  function Vm(e, t, l, o) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var u = o.value;
      e.payload = function() {
        return s(u);
      }, e.callback = function() {
        Bm(t, l, o);
      };
    }
    var h = l.stateNode;
    h !== null && typeof h.componentDidCatch == "function" && (e.callback = function() {
      Bm(t, l, o), typeof s != "function" && (ao === null ? ao = /* @__PURE__ */ new Set([this]) : ao.add(this));
      var w = o.stack;
      this.componentDidCatch(o.value, {
        componentStack: w !== null ? w : ""
      });
    });
  }
  function VS(e, t, l, o, s) {
    if (l.flags |= 32768, o !== null && typeof o == "object" && typeof o.then == "function") {
      if (t = l.alternate, t !== null && Rr(
        t,
        l,
        s,
        !0
      ), l = Nn.current, l !== null) {
        switch (l.tag) {
          case 31:
          case 13:
            return Qn === null ? ds() : l.alternate === null && It === 0 && (It = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, o === Vi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([o]) : t.add(o), Ef(e, o, s)), !1;
          case 22:
            return l.flags |= 65536, o === Vi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([o])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([o]) : l.add(o)), Ef(e, o, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return Ef(e, o, s), ds(), !1;
    }
    if (at)
      return t = Nn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, o !== hc && (e = Error(i(422), { cause: o }), ha(qn(e, l)))) : (o !== hc && (t = Error(i(423), {
        cause: o
      }), ha(
        qn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, o = qn(o, l), s = Jc(
        e.stateNode,
        o,
        s
      ), Oc(e, s), It !== 4 && (It = 2)), !1;
    var u = Error(i(520), { cause: o });
    if (u = qn(u, l), Ha === null ? Ha = [u] : Ha.push(u), It !== 4 && (It = 2), t === null) return !0;
    o = qn(o, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = Jc(l.stateNode, o, e), Oc(l, e), !1;
        case 1:
          if (t = l.type, u = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || u !== null && typeof u.componentDidCatch == "function" && (ao === null || !ao.has(u))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = Im(s), Vm(
              s,
              e,
              l,
              o
            ), Oc(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Wc = Error(i(461)), Zt = !1;
  function cn(e, t, l, o) {
    t.child = e === null ? Pg(t, null, l, o) : Vo(
      t,
      e.child,
      l,
      o
    );
  }
  function Ym(e, t, l, o, s) {
    l = l.render;
    var u = t.ref;
    if ("ref" in o) {
      var h = {};
      for (var w in o)
        w !== "ref" && (h[w] = o[w]);
    } else h = o;
    return Uo(t), o = _c(
      e,
      t,
      l,
      h,
      u,
      s
    ), w = kc(), e !== null && !Zt ? (Hc(e, t, s), Tl(e, t, s)) : (at && w && gc(t), t.flags |= 1, cn(e, t, o, s), t.child);
  }
  function Gm(e, t, l, o, s) {
    if (e === null) {
      var u = l.type;
      return typeof u == "function" && !fc(u) && u.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = u, qm(
        e,
        t,
        u,
        o,
        s
      )) : (e = Hi(
        l.type,
        null,
        o,
        t,
        t.mode,
        s
      ), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (u = e.child, !af(e, s)) {
      var h = u.memoizedProps;
      if (l = l.compare, l = l !== null ? l : pa, l(h, o) && e.ref === t.ref)
        return Tl(e, t, s);
    }
    return t.flags |= 1, e = vl(u, o), e.ref = t.ref, e.return = t, t.child = e;
  }
  function qm(e, t, l, o, s) {
    if (e !== null) {
      var u = e.memoizedProps;
      if (pa(u, o) && e.ref === t.ref)
        if (Zt = !1, t.pendingProps = o = u, af(e, s))
          (e.flags & 131072) !== 0 && (Zt = !0);
        else
          return t.lanes = e.lanes, Tl(e, t, s);
    }
    return $c(
      e,
      t,
      l,
      o,
      s
    );
  }
  function Pm(e, t, l, o) {
    var s = o.children, u = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), o.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (u = u !== null ? u.baseLanes | l : l, e !== null) {
          for (o = t.child = e.child, s = 0; o !== null; )
            s = s | o.lanes | o.childLanes, o = o.sibling;
          o = s & ~u;
        } else o = 0, t.child = null;
        return Xm(
          e,
          t,
          u,
          l,
          o
        );
      }
      if ((l & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Bi(
          t,
          u !== null ? u.cachePool : null
        ), u !== null ? Qg(t, u) : Ac(), Zg(t);
      else
        return o = t.lanes = 536870912, Xm(
          e,
          t,
          u !== null ? u.baseLanes | l : l,
          l,
          o
        );
    } else
      u !== null ? (Bi(t, u.cachePool), Qg(t, u), no(), t.memoizedState = null) : (e !== null && Bi(t, null), Ac(), no());
    return cn(e, t, s, l), t.child;
  }
  function Ma(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function Xm(e, t, l, o, s) {
    var u = Ec();
    return u = u === null ? null : { parent: Kt._currentValue, pool: u }, t.memoizedState = {
      baseLanes: l,
      cachePool: u
    }, e !== null && Bi(t, null), Ac(), Zg(t), e !== null && Rr(e, t, o, !0), t.childLanes = s, null;
  }
  function ts(e, t) {
    return t = ls(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Km(e, t, l) {
    return Vo(t, e.child, null, l), e = ts(t, t.pendingProps), e.flags |= 2, _n(t), t.memoizedState = null, e;
  }
  function YS(e, t, l) {
    var o = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (at) {
        if (o.mode === "hidden")
          return e = ts(t, o), t.lanes = 536870912, Ma(null, e);
        if (Dc(t), (e = Nt) ? (e = ry(
          e,
          Kn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: Ql !== null ? { id: ol, overflow: rl } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = zg(e), l.return = t, t.child = l, sn = t, Nt = null)) : e = null, e === null) throw Fl(t);
        return t.lanes = 536870912, null;
      }
      return ts(t, o);
    }
    var u = e.memoizedState;
    if (u !== null) {
      var h = u.dehydrated;
      if (Dc(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = Km(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if (Zt || Rr(e, t, l, !1), s = (l & e.childLanes) !== 0, Zt || s) {
        if (o = Tt, o !== null && (h = ml(o, l), h !== 0 && h !== u.retryLane))
          throw u.retryLane = h, _o(e, h), Rn(o, e, h), Wc;
        ds(), t = Km(
          e,
          t,
          l
        );
      } else
        e = u.treeContext, Nt = Zn(h.nextSibling), sn = t, at = !0, Zl = null, Kn = !1, e !== null && _g(t, e), t = ts(t, o), t.flags |= 4096;
      return t;
    }
    return e = vl(e.child, {
      mode: o.mode,
      children: o.children
    }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function ns(e, t) {
    var l = t.ref;
    if (l === null)
      e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof l != "function" && typeof l != "object")
        throw Error(i(284));
      (e === null || e.ref !== l) && (t.flags |= 4194816);
    }
  }
  function $c(e, t, l, o, s) {
    return Uo(t), l = _c(
      e,
      t,
      l,
      o,
      void 0,
      s
    ), o = kc(), e !== null && !Zt ? (Hc(e, t, s), Tl(e, t, s)) : (at && o && gc(t), t.flags |= 1, cn(e, t, l, s), t.child);
  }
  function Qm(e, t, l, o, s, u) {
    return Uo(t), t.updateQueue = null, l = Jg(
      t,
      o,
      l,
      s
    ), Fg(e), o = kc(), e !== null && !Zt ? (Hc(e, t, u), Tl(e, t, u)) : (at && o && gc(t), t.flags |= 1, cn(e, t, l, u), t.child);
  }
  function Zm(e, t, l, o, s) {
    if (Uo(t), t.stateNode === null) {
      var u = xr, h = l.contextType;
      typeof h == "object" && h !== null && (u = un(h)), u = new l(o, u), t.memoizedState = u.state !== null && u.state !== void 0 ? u.state : null, u.updater = Fc, t.stateNode = u, u._reactInternals = t, u = t.stateNode, u.props = o, u.state = t.memoizedState, u.refs = {}, Tc(t), h = l.contextType, u.context = typeof h == "object" && h !== null ? un(h) : xr, u.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (Zc(
        t,
        l,
        h,
        o
      ), u.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof u.getSnapshotBeforeUpdate == "function" || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (h = u.state, typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount(), h !== u.state && Fc.enqueueReplaceState(u, u.state, null), Ea(t, o, u, s), wa(), u.state = t.memoizedState), typeof u.componentDidMount == "function" && (t.flags |= 4194308), o = !0;
    } else if (e === null) {
      u = t.stateNode;
      var w = t.memoizedProps, U = Go(l, w);
      u.props = U;
      var W = u.context, ue = l.contextType;
      h = xr, typeof ue == "object" && ue !== null && (h = un(ue));
      var de = l.getDerivedStateFromProps;
      ue = typeof de == "function" || typeof u.getSnapshotBeforeUpdate == "function", w = t.pendingProps !== w, ue || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (w || W !== h) && Hm(
        t,
        u,
        o,
        h
      ), Wl = !1;
      var $ = t.memoizedState;
      u.state = $, Ea(t, o, u, s), wa(), W = t.memoizedState, w || $ !== W || Wl ? (typeof de == "function" && (Zc(
        t,
        l,
        de,
        o
      ), W = t.memoizedState), (U = Wl || km(
        t,
        l,
        U,
        o,
        $,
        W,
        h
      )) ? (ue || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount()), typeof u.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = o, t.memoizedState = W), u.props = o, u.state = W, u.context = h, o = U) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), o = !1);
    } else {
      u = t.stateNode, Cc(e, t), h = t.memoizedProps, ue = Go(l, h), u.props = ue, de = t.pendingProps, $ = u.context, W = l.contextType, U = xr, typeof W == "object" && W !== null && (U = un(W)), w = l.getDerivedStateFromProps, (W = typeof w == "function" || typeof u.getSnapshotBeforeUpdate == "function") || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (h !== de || $ !== U) && Hm(
        t,
        u,
        o,
        U
      ), Wl = !1, $ = t.memoizedState, u.state = $, Ea(t, o, u, s), wa();
      var ne = t.memoizedState;
      h !== de || $ !== ne || Wl || e !== null && e.dependencies !== null && Ui(e.dependencies) ? (typeof w == "function" && (Zc(
        t,
        l,
        w,
        o
      ), ne = t.memoizedState), (ue = Wl || km(
        t,
        l,
        ue,
        o,
        $,
        ne,
        U
      ) || e !== null && e.dependencies !== null && Ui(e.dependencies)) ? (W || typeof u.UNSAFE_componentWillUpdate != "function" && typeof u.componentWillUpdate != "function" || (typeof u.componentWillUpdate == "function" && u.componentWillUpdate(o, ne, U), typeof u.UNSAFE_componentWillUpdate == "function" && u.UNSAFE_componentWillUpdate(
        o,
        ne,
        U
      )), typeof u.componentDidUpdate == "function" && (t.flags |= 4), typeof u.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof u.componentDidUpdate != "function" || h === e.memoizedProps && $ === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && $ === e.memoizedState || (t.flags |= 1024), t.memoizedProps = o, t.memoizedState = ne), u.props = o, u.state = ne, u.context = U, o = ue) : (typeof u.componentDidUpdate != "function" || h === e.memoizedProps && $ === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && $ === e.memoizedState || (t.flags |= 1024), o = !1);
    }
    return u = o, ns(e, t), o = (t.flags & 128) !== 0, u || o ? (u = t.stateNode, l = o && typeof l.getDerivedStateFromError != "function" ? null : u.render(), t.flags |= 1, e !== null && o ? (t.child = Vo(
      t,
      e.child,
      null,
      s
    ), t.child = Vo(
      t,
      null,
      l,
      s
    )) : cn(e, t, l, s), t.memoizedState = u.state, e = t.child) : e = Tl(
      e,
      t,
      s
    ), e;
  }
  function Fm(e, t, l, o) {
    return Ho(), t.flags |= 256, cn(e, t, l, o), t.child;
  }
  var ef = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function tf(e) {
    return { baseLanes: e, cachePool: Bg() };
  }
  function nf(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function Jm(e, t, l) {
    var o = t.pendingProps, s = !1, u = (t.flags & 128) !== 0, h;
    if ((h = u) || (h = e !== null && e.memoizedState === null ? !1 : (Pt.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (at) {
        if (s ? to(t) : no(), (e = Nt) ? (e = ry(
          e,
          Kn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: Ql !== null ? { id: ol, overflow: rl } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = zg(e), l.return = t, t.child = l, sn = t, Nt = null)) : e = null, e === null) throw Fl(t);
        return Bf(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var w = o.children;
      return o = o.fallback, s ? (no(), s = t.mode, w = ls(
        { mode: "hidden", children: w },
        s
      ), o = ko(
        o,
        s,
        l,
        null
      ), w.return = t, o.return = t, w.sibling = o, t.child = w, o = t.child, o.memoizedState = tf(l), o.childLanes = nf(
        e,
        h,
        l
      ), t.memoizedState = ef, Ma(null, o)) : (to(t), lf(t, w));
    }
    var U = e.memoizedState;
    if (U !== null && (w = U.dehydrated, w !== null)) {
      if (u)
        t.flags & 256 ? (to(t), t.flags &= -257, t = of(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (no(), t.child = e.child, t.flags |= 128, t = null) : (no(), w = o.fallback, s = t.mode, o = ls(
          { mode: "visible", children: o.children },
          s
        ), w = ko(
          w,
          s,
          l,
          null
        ), w.flags |= 2, o.return = t, w.return = t, o.sibling = w, t.child = o, Vo(
          t,
          e.child,
          null,
          l
        ), o = t.child, o.memoizedState = tf(l), o.childLanes = nf(
          e,
          h,
          l
        ), t.memoizedState = ef, t = Ma(null, o));
      else if (to(t), Bf(w)) {
        if (h = w.nextSibling && w.nextSibling.dataset, h) var W = h.dgst;
        h = W, o = Error(i(419)), o.stack = "", o.digest = h, ha({ value: o, source: null, stack: null }), t = of(
          e,
          t,
          l
        );
      } else if (Zt || Rr(e, t, l, !1), h = (l & e.childLanes) !== 0, Zt || h) {
        if (h = Tt, h !== null && (o = ml(h, l), o !== 0 && o !== U.retryLane))
          throw U.retryLane = o, _o(e, o), Rn(h, e, o), Wc;
        Lf(w) || ds(), t = of(
          e,
          t,
          l
        );
      } else
        Lf(w) ? (t.flags |= 192, t.child = e.child, t = null) : (e = U.treeContext, Nt = Zn(
          w.nextSibling
        ), sn = t, at = !0, Zl = null, Kn = !1, e !== null && _g(t, e), t = lf(
          t,
          o.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (no(), w = o.fallback, s = t.mode, U = e.child, W = U.sibling, o = vl(U, {
      mode: "hidden",
      children: o.children
    }), o.subtreeFlags = U.subtreeFlags & 65011712, W !== null ? w = vl(
      W,
      w
    ) : (w = ko(
      w,
      s,
      l,
      null
    ), w.flags |= 2), w.return = t, o.return = t, o.sibling = w, t.child = o, Ma(null, o), o = t.child, w = e.child.memoizedState, w === null ? w = tf(l) : (s = w.cachePool, s !== null ? (U = Kt._currentValue, s = s.parent !== U ? { parent: U, pool: U } : s) : s = Bg(), w = {
      baseLanes: w.baseLanes | l,
      cachePool: s
    }), o.memoizedState = w, o.childLanes = nf(
      e,
      h,
      l
    ), t.memoizedState = ef, Ma(e.child, o)) : (to(t), l = e.child, e = l.sibling, l = vl(l, {
      mode: "visible",
      children: o.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function lf(e, t) {
    return t = ls(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ls(e, t) {
    return e = Dn(22, e, null, t), e.lanes = 0, e;
  }
  function of(e, t, l) {
    return Vo(t, e.child, null, l), e = lf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function Wm(e, t, l) {
    e.lanes |= t;
    var o = e.alternate;
    o !== null && (o.lanes |= t), vc(e.return, t, l);
  }
  function rf(e, t, l, o, s, u) {
    var h = e.memoizedState;
    h === null ? e.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: o,
      tail: l,
      tailMode: s,
      treeForkCount: u
    } : (h.isBackwards = t, h.rendering = null, h.renderingStartTime = 0, h.last = o, h.tail = l, h.tailMode = s, h.treeForkCount = u);
  }
  function $m(e, t, l) {
    var o = t.pendingProps, s = o.revealOrder, u = o.tail;
    o = o.children;
    var h = Pt.current, w = (h & 2) !== 0;
    if (w ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, te(Pt, h), cn(e, t, o, l), o = at ? ma : 0, !w && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && Wm(e, l, t);
        else if (e.tag === 19)
          Wm(e, l, t);
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
          e = l.alternate, e !== null && Pi(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), rf(
          t,
          !1,
          s,
          l,
          u,
          o
        );
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (l = null, s = t.child, t.child = null; s !== null; ) {
          if (e = s.alternate, e !== null && Pi(e) === null) {
            t.child = s;
            break;
          }
          e = s.sibling, s.sibling = l, l = s, s = e;
        }
        rf(
          t,
          !0,
          l,
          null,
          u,
          o
        );
        break;
      case "together":
        rf(
          t,
          !1,
          null,
          null,
          void 0,
          o
        );
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Tl(e, t, l) {
    if (e !== null && (t.dependencies = e.dependencies), ro |= t.lanes, (l & t.childLanes) === 0)
      if (e !== null) {
        if (Rr(
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
      for (e = t.child, l = vl(e, e.pendingProps), t.child = l, l.return = t; e.sibling !== null; )
        e = e.sibling, l = l.sibling = vl(e, e.pendingProps), l.return = t;
      l.sibling = null;
    }
    return t.child;
  }
  function af(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Ui(e)));
  }
  function GS(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), Jl(t, Kt, e.memoizedState.cache), Ho();
        break;
      case 27:
      case 5:
        _e(t);
        break;
      case 4:
        se(t, t.stateNode.containerInfo);
        break;
      case 10:
        Jl(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, Dc(t), null;
        break;
      case 13:
        var o = t.memoizedState;
        if (o !== null)
          return o.dehydrated !== null ? (to(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? Jm(e, t, l) : (to(t), e = Tl(
            e,
            t,
            l
          ), e !== null ? e.sibling : null);
        to(t);
        break;
      case 19:
        var s = (e.flags & 128) !== 0;
        if (o = (l & t.childLanes) !== 0, o || (Rr(
          e,
          t,
          l,
          !1
        ), o = (l & t.childLanes) !== 0), s) {
          if (o)
            return $m(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), te(Pt, Pt.current), o) break;
        return null;
      case 22:
        return t.lanes = 0, Pm(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        Jl(t, Kt, e.memoizedState.cache);
    }
    return Tl(e, t, l);
  }
  function eh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        Zt = !0;
      else {
        if (!af(e, l) && (t.flags & 128) === 0)
          return Zt = !1, GS(
            e,
            t,
            l
          );
        Zt = (e.flags & 131072) !== 0;
      }
    else
      Zt = !1, at && (t.flags & 1048576) !== 0 && Ng(t, ma, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var o = t.pendingProps;
          if (e = Bo(t.elementType), t.type = e, typeof e == "function")
            fc(e) ? (o = Go(e, o), t.tag = 1, t = Zm(
              null,
              t,
              e,
              o,
              l
            )) : (t.tag = 0, t = $c(
              null,
              t,
              e,
              o,
              l
            ));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === M) {
                t.tag = 11, t = Ym(
                  null,
                  t,
                  e,
                  o,
                  l
                );
                break e;
              } else if (s === j) {
                t.tag = 14, t = Gm(
                  null,
                  t,
                  e,
                  o,
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
        return $c(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 1:
        return o = t.type, s = Go(
          o,
          t.pendingProps
        ), Zm(
          e,
          t,
          o,
          s,
          l
        );
      case 3:
        e: {
          if (se(
            t,
            t.stateNode.containerInfo
          ), e === null) throw Error(i(387));
          o = t.pendingProps;
          var u = t.memoizedState;
          s = u.element, Cc(e, t), Ea(t, o, null, l);
          var h = t.memoizedState;
          if (o = h.cache, Jl(t, Kt, o), o !== u.cache && xc(
            t,
            [Kt],
            l,
            !0
          ), wa(), o = h.element, u.isDehydrated)
            if (u = {
              element: o,
              isDehydrated: !1,
              cache: h.cache
            }, t.updateQueue.baseState = u, t.memoizedState = u, t.flags & 256) {
              t = Fm(
                e,
                t,
                o,
                l
              );
              break e;
            } else if (o !== s) {
              s = qn(
                Error(i(424)),
                t
              ), ha(s), t = Fm(
                e,
                t,
                o,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, Nt = Zn(e.firstChild), sn = t, at = !0, Zl = null, Kn = !0, l = Pg(
                t,
                null,
                o,
                l
              ), t.child = l; l; )
                l.flags = l.flags & -3 | 4096, l = l.sibling;
          else {
            if (Ho(), o === s) {
              t = Tl(
                e,
                t,
                l
              );
              break e;
            }
            cn(e, t, o, l);
          }
          t = t.child;
        }
        return t;
      case 26:
        return ns(e, t), e === null ? (l = fy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : at || (l = t.type, e = t.pendingProps, o = vs(
          ae.current
        ).createElement(l), o[Rt] = t, o[an] = e, fn(o, l, e), tn(o), t.stateNode = o) : t.memoizedState = fy(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return _e(t), e === null && at && (o = t.stateNode = sy(
          t.type,
          t.pendingProps,
          ae.current
        ), sn = t, Kn = !0, s = Nt, co(t.type) ? (If = s, Nt = Zn(o.firstChild)) : Nt = s), cn(
          e,
          t,
          t.pendingProps.children,
          l
        ), ns(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && at && ((s = o = Nt) && (o = vw(
          o,
          t.type,
          t.pendingProps,
          Kn
        ), o !== null ? (t.stateNode = o, sn = t, Nt = Zn(o.firstChild), Kn = !1, s = !0) : s = !1), s || Fl(t)), _e(t), s = t.type, u = t.pendingProps, h = e !== null ? e.memoizedProps : null, o = u.children, Hf(s, u) ? o = null : h !== null && Hf(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = _c(
          e,
          t,
          kS,
          null,
          null,
          l
        ), Ga._currentValue = s), ns(e, t), cn(e, t, o, l), t.child;
      case 6:
        return e === null && at && ((e = l = Nt) && (l = xw(
          l,
          t.pendingProps,
          Kn
        ), l !== null ? (t.stateNode = l, sn = t, Nt = null, e = !0) : e = !1), e || Fl(t)), null;
      case 13:
        return Jm(e, t, l);
      case 4:
        return se(
          t,
          t.stateNode.containerInfo
        ), o = t.pendingProps, e === null ? t.child = Vo(
          t,
          null,
          o,
          l
        ) : cn(e, t, o, l), t.child;
      case 11:
        return Ym(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 7:
        return cn(
          e,
          t,
          t.pendingProps,
          l
        ), t.child;
      case 8:
        return cn(
          e,
          t,
          t.pendingProps.children,
          l
        ), t.child;
      case 12:
        return cn(
          e,
          t,
          t.pendingProps.children,
          l
        ), t.child;
      case 10:
        return o = t.pendingProps, Jl(t, t.type, o.value), cn(e, t, o.children, l), t.child;
      case 9:
        return s = t.type._context, o = t.pendingProps.children, Uo(t), s = un(s), o = o(s), t.flags |= 1, cn(e, t, o, l), t.child;
      case 14:
        return Gm(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return qm(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return $m(e, t, l);
      case 31:
        return YS(e, t, l);
      case 22:
        return Pm(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return Uo(t), o = un(Kt), e === null ? (s = Ec(), s === null && (s = Tt, u = Sc(), s.pooledCache = u, u.refCount++, u !== null && (s.pooledCacheLanes |= l), s = u), t.memoizedState = { parent: o, cache: s }, Tc(t), Jl(t, Kt, s)) : ((e.lanes & l) !== 0 && (Cc(e, t), Ea(t, null, null, l), wa()), s = e.memoizedState, u = t.memoizedState, s.parent !== o ? (s = { parent: o, cache: o }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), Jl(t, Kt, o)) : (o = u.cache, Jl(t, Kt, o), o !== s.cache && xc(
          t,
          [Kt],
          l,
          !0
        ))), cn(
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
  function Cl(e) {
    e.flags |= 4;
  }
  function sf(e, t, l, o, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (Oh()) e.flags |= 8192;
        else
          throw Io = Vi, Rc;
    } else e.flags &= -16777217;
  }
  function th(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !hy(t))
      if (Oh()) e.flags |= 8192;
      else
        throw Io = Vi, Rc;
  }
  function os(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? An() : 536870912, e.lanes |= t, jr |= t);
  }
  function Aa(e, t) {
    if (!at)
      switch (e.tailMode) {
        case "hidden":
          t = e.tail;
          for (var l = null; t !== null; )
            t.alternate !== null && (l = t), t = t.sibling;
          l === null ? e.tail = null : l.sibling = null;
          break;
        case "collapsed":
          l = e.tail;
          for (var o = null; l !== null; )
            l.alternate !== null && (o = l), l = l.sibling;
          o === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : o.sibling = null;
      }
  }
  function _t(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, l = 0, o = 0;
    if (t)
      for (var s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, o |= s.subtreeFlags & 65011712, o |= s.flags & 65011712, s.return = e, s = s.sibling;
    else
      for (s = e.child; s !== null; )
        l |= s.lanes | s.childLanes, o |= s.subtreeFlags, o |= s.flags, s.return = e, s = s.sibling;
    return e.subtreeFlags |= o, e.childLanes = l, t;
  }
  function qS(e, t, l) {
    var o = t.pendingProps;
    switch (mc(t), t.tag) {
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
        return l = t.stateNode, o = null, e !== null && (o = e.memoizedState.cache), t.memoizedState.cache !== o && (t.flags |= 2048), wl(Kt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Er(t) ? Cl(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, yc())), _t(t), null;
      case 26:
        var s = t.type, u = t.memoizedState;
        return e === null ? (Cl(t), u !== null ? (_t(t), th(t, u)) : (_t(t), sf(
          t,
          s,
          null,
          o,
          l
        ))) : u ? u !== e.memoizedState ? (Cl(t), _t(t), th(t, u)) : (_t(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== o && Cl(t), _t(t), sf(
          t,
          s,
          e,
          o,
          l
        )), null;
      case 27:
        if (Ee(t), l = ae.current, s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== o && Cl(t);
        else {
          if (!o) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          e = ee.current, Er(t) ? kg(t) : (e = sy(s, o, l), t.stateNode = e, Cl(t));
        }
        return _t(t), null;
      case 5:
        if (Ee(t), s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== o && Cl(t);
        else {
          if (!o) {
            if (t.stateNode === null)
              throw Error(i(166));
            return _t(t), null;
          }
          if (u = ee.current, Er(t))
            kg(t);
          else {
            var h = vs(
              ae.current
            );
            switch (u) {
              case 1:
                u = h.createElementNS(
                  "http://www.w3.org/2000/svg",
                  s
                );
                break;
              case 2:
                u = h.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  s
                );
                break;
              default:
                switch (s) {
                  case "svg":
                    u = h.createElementNS(
                      "http://www.w3.org/2000/svg",
                      s
                    );
                    break;
                  case "math":
                    u = h.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      s
                    );
                    break;
                  case "script":
                    u = h.createElement("div"), u.innerHTML = "<script><\/script>", u = u.removeChild(
                      u.firstChild
                    );
                    break;
                  case "select":
                    u = typeof o.is == "string" ? h.createElement("select", {
                      is: o.is
                    }) : h.createElement("select"), o.multiple ? u.multiple = !0 : o.size && (u.size = o.size);
                    break;
                  default:
                    u = typeof o.is == "string" ? h.createElement(s, { is: o.is }) : h.createElement(s);
                }
            }
            u[Rt] = t, u[an] = o;
            e: for (h = t.child; h !== null; ) {
              if (h.tag === 5 || h.tag === 6)
                u.appendChild(h.stateNode);
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
            t.stateNode = u;
            e: switch (fn(u, s, o), s) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                o = !!o.autoFocus;
                break e;
              case "img":
                o = !0;
                break e;
              default:
                o = !1;
            }
            o && Cl(t);
          }
        }
        return _t(t), sf(
          t,
          t.type,
          e === null ? null : e.memoizedProps,
          t.pendingProps,
          l
        ), null;
      case 6:
        if (e && t.stateNode != null)
          e.memoizedProps !== o && Cl(t);
        else {
          if (typeof o != "string" && t.stateNode === null)
            throw Error(i(166));
          if (e = ae.current, Er(t)) {
            if (e = t.stateNode, l = t.memoizedProps, o = null, s = sn, s !== null)
              switch (s.tag) {
                case 27:
                case 5:
                  o = s.memoizedProps;
              }
            e[Rt] = t, e = !!(e.nodeValue === l || o !== null && o.suppressHydrationWarning === !0 || Jh(e.nodeValue, l)), e || Fl(t, !0);
          } else
            e = vs(e).createTextNode(
              o
            ), e[Rt] = t, t.stateNode = e;
        }
        return _t(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (o = Er(t), l !== null) {
            if (e === null) {
              if (!o) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Rt] = t;
            } else
              Ho(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), e = !1;
          } else
            l = yc(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
          if (!e)
            return t.flags & 256 ? (_n(t), t) : (_n(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(i(558));
        }
        return _t(t), null;
      case 13:
        if (o = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (s = Er(t), o !== null && o.dehydrated !== null) {
            if (e === null) {
              if (!s) throw Error(i(318));
              if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(i(317));
              s[Rt] = t;
            } else
              Ho(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            _t(t), s = !1;
          } else
            s = yc(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (_n(t), t) : (_n(t), null);
        }
        return _n(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = o !== null, e = e !== null && e.memoizedState !== null, l && (o = t.child, s = null, o.alternate !== null && o.alternate.memoizedState !== null && o.alternate.memoizedState.cachePool !== null && (s = o.alternate.memoizedState.cachePool.pool), u = null, o.memoizedState !== null && o.memoizedState.cachePool !== null && (u = o.memoizedState.cachePool.pool), u !== s && (o.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), os(t, t.updateQueue), _t(t), null);
      case 4:
        return ge(), e === null && zf(t.stateNode.containerInfo), _t(t), null;
      case 10:
        return wl(t.type), _t(t), null;
      case 19:
        if (H(Pt), o = t.memoizedState, o === null) return _t(t), null;
        if (s = (t.flags & 128) !== 0, u = o.rendering, u === null)
          if (s) Aa(o, !1);
          else {
            if (It !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (u = Pi(e), u !== null) {
                  for (t.flags |= 128, Aa(o, !1), e = u.updateQueue, t.updateQueue = e, os(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    Ag(l, e), l = l.sibling;
                  return te(
                    Pt,
                    Pt.current & 1 | 2
                  ), at && xl(t, o.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            o.tail !== null && oe() > us && (t.flags |= 128, s = !0, Aa(o, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = Pi(u), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, os(t, e), Aa(o, !0), o.tail === null && o.tailMode === "hidden" && !u.alternate && !at)
                return _t(t), null;
            } else
              2 * oe() - o.renderingStartTime > us && l !== 536870912 && (t.flags |= 128, s = !0, Aa(o, !1), t.lanes = 4194304);
          o.isBackwards ? (u.sibling = t.child, t.child = u) : (e = o.last, e !== null ? e.sibling = u : t.child = u, o.last = u);
        }
        return o.tail !== null ? (e = o.tail, o.rendering = e, o.tail = e.sibling, o.renderingStartTime = oe(), e.sibling = null, l = Pt.current, te(
          Pt,
          s ? l & 1 | 2 : l & 1
        ), at && xl(t, o.treeForkCount), e) : (_t(t), null);
      case 22:
      case 23:
        return _n(t), zc(), o = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== o && (t.flags |= 8192) : o && (t.flags |= 8192), o ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (_t(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : _t(t), l = t.updateQueue, l !== null && os(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), o = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (o = t.memoizedState.cachePool.pool), o !== l && (t.flags |= 2048), e !== null && H(Lo), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), wl(Kt), _t(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function PS(e, t) {
    switch (mc(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return wl(Kt), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (_n(t), t.alternate === null)
            throw Error(i(340));
          Ho();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (_n(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(i(340));
          Ho();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return H(Pt), null;
      case 4:
        return ge(), null;
      case 10:
        return wl(t.type), null;
      case 22:
      case 23:
        return _n(t), zc(), e !== null && H(Lo), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return wl(Kt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function nh(e, t) {
    switch (mc(t), t.tag) {
      case 3:
        wl(Kt), ge();
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
        H(Pt);
        break;
      case 10:
        wl(t.type);
        break;
      case 22:
      case 23:
        _n(t), zc(), e !== null && H(Lo);
        break;
      case 24:
        wl(Kt);
    }
  }
  function za(e, t) {
    try {
      var l = t.updateQueue, o = l !== null ? l.lastEffect : null;
      if (o !== null) {
        var s = o.next;
        l = s;
        do {
          if ((l.tag & e) === e) {
            o = void 0;
            var u = l.create, h = l.inst;
            o = u(), h.destroy = o;
          }
          l = l.next;
        } while (l !== s);
      }
    } catch (w) {
      yt(t, t.return, w);
    }
  }
  function lo(e, t, l) {
    try {
      var o = t.updateQueue, s = o !== null ? o.lastEffect : null;
      if (s !== null) {
        var u = s.next;
        o = u;
        do {
          if ((o.tag & e) === e) {
            var h = o.inst, w = h.destroy;
            if (w !== void 0) {
              h.destroy = void 0, s = t;
              var U = l, W = w;
              try {
                W();
              } catch (ue) {
                yt(
                  s,
                  U,
                  ue
                );
              }
            }
          }
          o = o.next;
        } while (o !== u);
      }
    } catch (ue) {
      yt(t, t.return, ue);
    }
  }
  function lh(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        Kg(t, l);
      } catch (o) {
        yt(e, e.return, o);
      }
    }
  }
  function oh(e, t, l) {
    l.props = Go(
      e.type,
      e.memoizedProps
    ), l.state = e.memoizedState;
    try {
      l.componentWillUnmount();
    } catch (o) {
      yt(e, t, o);
    }
  }
  function Da(e, t) {
    try {
      var l = e.ref;
      if (l !== null) {
        switch (e.tag) {
          case 26:
          case 27:
          case 5:
            var o = e.stateNode;
            break;
          case 30:
            o = e.stateNode;
            break;
          default:
            o = e.stateNode;
        }
        typeof l == "function" ? e.refCleanup = l(o) : l.current = o;
      }
    } catch (s) {
      yt(e, t, s);
    }
  }
  function al(e, t) {
    var l = e.ref, o = e.refCleanup;
    if (l !== null)
      if (typeof o == "function")
        try {
          o();
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
  function rh(e) {
    var t = e.type, l = e.memoizedProps, o = e.stateNode;
    try {
      e: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          l.autoFocus && o.focus();
          break e;
        case "img":
          l.src ? o.src = l.src : l.srcSet && (o.srcset = l.srcSet);
      }
    } catch (s) {
      yt(e, e.return, s);
    }
  }
  function uf(e, t, l) {
    try {
      var o = e.stateNode;
      pw(o, e.type, l, t), o[an] = t;
    } catch (s) {
      yt(e, e.return, s);
    }
  }
  function ah(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && co(e.type) || e.tag === 4;
  }
  function cf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || ah(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && co(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function ff(e, t, l) {
    var o = e.tag;
    if (o === 5 || o === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = yl));
    else if (o !== 4 && (o === 27 && co(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (ff(e, t, l), e = e.sibling; e !== null; )
        ff(e, t, l), e = e.sibling;
  }
  function rs(e, t, l) {
    var o = e.tag;
    if (o === 5 || o === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (o !== 4 && (o === 27 && co(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (rs(e, t, l), e = e.sibling; e !== null; )
        rs(e, t, l), e = e.sibling;
  }
  function ih(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var o = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      fn(t, o, l), t[Rt] = e, t[an] = l;
    } catch (u) {
      yt(e, e.return, u);
    }
  }
  var Ol = !1, Ft = !1, df = !1, sh = typeof WeakSet == "function" ? WeakSet : Set, nn = null;
  function XS(e, t) {
    if (e = e.containerInfo, _f = Cs, e = xg(e), oc(e)) {
      if ("selectionStart" in e)
        var l = {
          start: e.selectionStart,
          end: e.selectionEnd
        };
      else
        e: {
          l = (l = e.ownerDocument) && l.defaultView || window;
          var o = l.getSelection && l.getSelection();
          if (o && o.rangeCount !== 0) {
            l = o.anchorNode;
            var s = o.anchorOffset, u = o.focusNode;
            o = o.focusOffset;
            try {
              l.nodeType, u.nodeType;
            } catch {
              l = null;
              break e;
            }
            var h = 0, w = -1, U = -1, W = 0, ue = 0, de = e, $ = null;
            t: for (; ; ) {
              for (var ne; de !== l || s !== 0 && de.nodeType !== 3 || (w = h + s), de !== u || o !== 0 && de.nodeType !== 3 || (U = h + o), de.nodeType === 3 && (h += de.nodeValue.length), (ne = de.firstChild) !== null; )
                $ = de, de = ne;
              for (; ; ) {
                if (de === e) break t;
                if ($ === l && ++W === s && (w = h), $ === u && ++ue === o && (U = h), (ne = de.nextSibling) !== null) break;
                de = $, $ = de.parentNode;
              }
              de = ne;
            }
            l = w === -1 || U === -1 ? null : { start: w, end: U };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (kf = { focusedElem: e, selectionRange: l }, Cs = !1, nn = t; nn !== null; )
      if (t = nn, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null)
        e.return = t, nn = e;
      else
        for (; nn !== null; ) {
          switch (t = nn, u = t.alternate, e = t.flags, t.tag) {
            case 0:
              if ((e & 4) !== 0 && (e = t.updateQueue, e = e !== null ? e.events : null, e !== null))
                for (l = 0; l < e.length; l++)
                  s = e[l], s.ref.impl = s.nextImpl;
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((e & 1024) !== 0 && u !== null) {
                e = void 0, l = t, s = u.memoizedProps, u = u.memoizedState, o = l.stateNode;
                try {
                  var ze = Go(
                    l.type,
                    s
                  );
                  e = o.getSnapshotBeforeUpdate(
                    ze,
                    u
                  ), o.__reactInternalSnapshotBeforeUpdate = e;
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
                  Uf(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      Uf(e);
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
            e.return = t.return, nn = e;
            break;
          }
          nn = t.return;
        }
  }
  function uh(e, t, l) {
    var o = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Al(e, l), o & 4 && za(5, l);
        break;
      case 1:
        if (Al(e, l), o & 4)
          if (e = l.stateNode, t === null)
            try {
              e.componentDidMount();
            } catch (h) {
              yt(l, l.return, h);
            }
          else {
            var s = Go(
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
        o & 64 && lh(l), o & 512 && Da(l, l.return);
        break;
      case 3:
        if (Al(e, l), o & 64 && (e = l.updateQueue, e !== null)) {
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
            Kg(e, t);
          } catch (h) {
            yt(l, l.return, h);
          }
        }
        break;
      case 27:
        t === null && o & 4 && ih(l);
      case 26:
      case 5:
        Al(e, l), t === null && o & 4 && rh(l), o & 512 && Da(l, l.return);
        break;
      case 12:
        Al(e, l);
        break;
      case 31:
        Al(e, l), o & 4 && dh(e, l);
        break;
      case 13:
        Al(e, l), o & 4 && ph(e, l), o & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = tw.bind(
          null,
          l
        ), Sw(e, l))));
        break;
      case 22:
        if (o = l.memoizedState !== null || Ol, !o) {
          t = t !== null && t.memoizedState !== null || Ft, s = Ol;
          var u = Ft;
          Ol = o, (Ft = t) && !u ? zl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Al(e, l), Ol = s, Ft = u;
        }
        break;
      case 30:
        break;
      default:
        Al(e, l);
    }
  }
  function ch(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, ch(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && Vu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var jt = null, xn = !1;
  function Ml(e, t, l) {
    for (l = l.child; l !== null; )
      fh(e, t, l), l = l.sibling;
  }
  function fh(e, t, l) {
    if (gt && typeof gt.onCommitFiberUnmount == "function")
      try {
        gt.onCommitFiberUnmount($e, l);
      } catch {
      }
    switch (l.tag) {
      case 26:
        Ft || al(l, t), Ml(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        Ft || al(l, t);
        var o = jt, s = xn;
        co(l.type) && (jt = l.stateNode, xn = !1), Ml(
          e,
          t,
          l
        ), Ia(l.stateNode), jt = o, xn = s;
        break;
      case 5:
        Ft || al(l, t);
      case 6:
        if (o = jt, s = xn, jt = null, Ml(
          e,
          t,
          l
        ), jt = o, xn = s, jt !== null)
          if (xn)
            try {
              (jt.nodeType === 9 ? jt.body : jt.nodeName === "HTML" ? jt.ownerDocument.body : jt).removeChild(l.stateNode);
            } catch (u) {
              yt(
                l,
                t,
                u
              );
            }
          else
            try {
              jt.removeChild(l.stateNode);
            } catch (u) {
              yt(
                l,
                t,
                u
              );
            }
        break;
      case 18:
        jt !== null && (xn ? (e = jt, ly(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), qr(e)) : ly(jt, l.stateNode));
        break;
      case 4:
        o = jt, s = xn, jt = l.stateNode.containerInfo, xn = !0, Ml(
          e,
          t,
          l
        ), jt = o, xn = s;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        lo(2, l, t), Ft || lo(4, l, t), Ml(
          e,
          t,
          l
        );
        break;
      case 1:
        Ft || (al(l, t), o = l.stateNode, typeof o.componentWillUnmount == "function" && oh(
          l,
          t,
          o
        )), Ml(
          e,
          t,
          l
        );
        break;
      case 21:
        Ml(
          e,
          t,
          l
        );
        break;
      case 22:
        Ft = (o = Ft) || l.memoizedState !== null, Ml(
          e,
          t,
          l
        ), Ft = o;
        break;
      default:
        Ml(
          e,
          t,
          l
        );
    }
  }
  function dh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        qr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
    }
  }
  function ph(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        qr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
  }
  function KS(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new sh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new sh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function as(e, t) {
    var l = KS(e);
    t.forEach(function(o) {
      if (!l.has(o)) {
        l.add(o);
        var s = nw.bind(null, e, o);
        o.then(s, s);
      }
    });
  }
  function Sn(e, t) {
    var l = t.deletions;
    if (l !== null)
      for (var o = 0; o < l.length; o++) {
        var s = l[o], u = e, h = t, w = h;
        e: for (; w !== null; ) {
          switch (w.tag) {
            case 27:
              if (co(w.type)) {
                jt = w.stateNode, xn = !1;
                break e;
              }
              break;
            case 5:
              jt = w.stateNode, xn = !1;
              break e;
            case 3:
            case 4:
              jt = w.stateNode.containerInfo, xn = !0;
              break e;
          }
          w = w.return;
        }
        if (jt === null) throw Error(i(160));
        fh(u, h, s), jt = null, xn = !1, u = s.alternate, u !== null && (u.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        gh(t, e), t = t.sibling;
  }
  var el = null;
  function gh(e, t) {
    var l = e.alternate, o = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Sn(t, e), wn(e), o & 4 && (lo(3, e, e.return), za(3, e), lo(5, e, e.return));
        break;
      case 1:
        Sn(t, e), wn(e), o & 512 && (Ft || l === null || al(l, l.return)), o & 64 && Ol && (e = e.updateQueue, e !== null && (o = e.callbacks, o !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? o : l.concat(o))));
        break;
      case 26:
        var s = el;
        if (Sn(t, e), wn(e), o & 512 && (Ft || l === null || al(l, l.return)), o & 4) {
          var u = l !== null ? l.memoizedState : null;
          if (o = e.memoizedState, l === null)
            if (o === null)
              if (e.stateNode === null) {
                e: {
                  o = e.type, l = e.memoizedProps, s = s.ownerDocument || s;
                  t: switch (o) {
                    case "title":
                      u = s.getElementsByTagName("title")[0], (!u || u[oa] || u[Rt] || u.namespaceURI === "http://www.w3.org/2000/svg" || u.hasAttribute("itemprop")) && (u = s.createElement(o), s.head.insertBefore(
                        u,
                        s.querySelector("head > title")
                      )), fn(u, o, l), u[Rt] = e, tn(u), o = u;
                      break e;
                    case "link":
                      var h = gy(
                        "link",
                        "href",
                        s
                      ).get(o + (l.href || ""));
                      if (h) {
                        for (var w = 0; w < h.length; w++)
                          if (u = h[w], u.getAttribute("href") === (l.href == null || l.href === "" ? null : l.href) && u.getAttribute("rel") === (l.rel == null ? null : l.rel) && u.getAttribute("title") === (l.title == null ? null : l.title) && u.getAttribute("crossorigin") === (l.crossOrigin == null ? null : l.crossOrigin)) {
                            h.splice(w, 1);
                            break t;
                          }
                      }
                      u = s.createElement(o), fn(u, o, l), s.head.appendChild(u);
                      break;
                    case "meta":
                      if (h = gy(
                        "meta",
                        "content",
                        s
                      ).get(o + (l.content || ""))) {
                        for (w = 0; w < h.length; w++)
                          if (u = h[w], u.getAttribute("content") === (l.content == null ? null : "" + l.content) && u.getAttribute("name") === (l.name == null ? null : l.name) && u.getAttribute("property") === (l.property == null ? null : l.property) && u.getAttribute("http-equiv") === (l.httpEquiv == null ? null : l.httpEquiv) && u.getAttribute("charset") === (l.charSet == null ? null : l.charSet)) {
                            h.splice(w, 1);
                            break t;
                          }
                      }
                      u = s.createElement(o), fn(u, o, l), s.head.appendChild(u);
                      break;
                    default:
                      throw Error(i(468, o));
                  }
                  u[Rt] = e, tn(u), o = u;
                }
                e.stateNode = o;
              } else
                my(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = py(
                s,
                o,
                e.memoizedProps
              );
          else
            u !== o ? (u === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : u.count--, o === null ? my(
              s,
              e.type,
              e.stateNode
            ) : py(
              s,
              o,
              e.memoizedProps
            )) : o === null && e.stateNode !== null && uf(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Sn(t, e), wn(e), o & 512 && (Ft || l === null || al(l, l.return)), l !== null && o & 4 && uf(
          e,
          e.memoizedProps,
          l.memoizedProps
        );
        break;
      case 5:
        if (Sn(t, e), wn(e), o & 512 && (Ft || l === null || al(l, l.return)), e.flags & 32) {
          s = e.stateNode;
          try {
            pr(s, "");
          } catch (ze) {
            yt(e, e.return, ze);
          }
        }
        o & 4 && e.stateNode != null && (s = e.memoizedProps, uf(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), o & 1024 && (df = !0);
        break;
      case 6:
        if (Sn(t, e), wn(e), o & 4) {
          if (e.stateNode === null)
            throw Error(i(162));
          o = e.memoizedProps, l = e.stateNode;
          try {
            l.nodeValue = o;
          } catch (ze) {
            yt(e, e.return, ze);
          }
        }
        break;
      case 3:
        if (ws = null, s = el, el = xs(t.containerInfo), Sn(t, e), el = s, wn(e), o & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            qr(t.containerInfo);
          } catch (ze) {
            yt(e, e.return, ze);
          }
        df && (df = !1, mh(e));
        break;
      case 4:
        o = el, el = xs(
          e.stateNode.containerInfo
        ), Sn(t, e), wn(e), el = o;
        break;
      case 12:
        Sn(t, e), wn(e);
        break;
      case 31:
        Sn(t, e), wn(e), o & 4 && (o = e.updateQueue, o !== null && (e.updateQueue = null, as(e, o)));
        break;
      case 13:
        Sn(t, e), wn(e), e.child.flags & 8192 && e.memoizedState !== null != (l !== null && l.memoizedState !== null) && (ss = oe()), o & 4 && (o = e.updateQueue, o !== null && (e.updateQueue = null, as(e, o)));
        break;
      case 22:
        s = e.memoizedState !== null;
        var U = l !== null && l.memoizedState !== null, W = Ol, ue = Ft;
        if (Ol = W || s, Ft = ue || U, Sn(t, e), Ft = ue, Ol = W, wn(e), o & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || U || Ol || Ft || qo(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                U = l = t;
                try {
                  if (u = U.stateNode, s)
                    h = u.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    w = U.stateNode;
                    var de = U.memoizedProps.style, $ = de != null && de.hasOwnProperty("display") ? de.display : null;
                    w.style.display = $ == null || typeof $ == "boolean" ? "" : ("" + $).trim();
                  }
                } catch (ze) {
                  yt(U, U.return, ze);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                U = t;
                try {
                  U.stateNode.nodeValue = s ? "" : U.memoizedProps;
                } catch (ze) {
                  yt(U, U.return, ze);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                U = t;
                try {
                  var ne = U.stateNode;
                  s ? oy(ne, !0) : oy(U.stateNode, !1);
                } catch (ze) {
                  yt(U, U.return, ze);
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
        o & 4 && (o = e.updateQueue, o !== null && (l = o.retryQueue, l !== null && (o.retryQueue = null, as(e, l))));
        break;
      case 19:
        Sn(t, e), wn(e), o & 4 && (o = e.updateQueue, o !== null && (e.updateQueue = null, as(e, o)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Sn(t, e), wn(e);
    }
  }
  function wn(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var l, o = e.return; o !== null; ) {
          if (ah(o)) {
            l = o;
            break;
          }
          o = o.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, u = cf(e);
            rs(e, u, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (pr(h, ""), l.flags &= -33);
            var w = cf(e);
            rs(e, w, h);
            break;
          case 3:
          case 4:
            var U = l.stateNode.containerInfo, W = cf(e);
            ff(
              e,
              W,
              U
            );
            break;
          default:
            throw Error(i(161));
        }
      } catch (ue) {
        yt(e, e.return, ue);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function mh(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        mh(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Al(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        uh(e, t.alternate, t), t = t.sibling;
  }
  function qo(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          lo(4, t, t.return), qo(t);
          break;
        case 1:
          al(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && oh(
            t,
            t.return,
            l
          ), qo(t);
          break;
        case 27:
          Ia(t.stateNode);
        case 26:
        case 5:
          al(t, t.return), qo(t);
          break;
        case 22:
          t.memoizedState === null && qo(t);
          break;
        case 30:
          qo(t);
          break;
        default:
          qo(t);
      }
      e = e.sibling;
    }
  }
  function zl(e, t, l) {
    for (l = l && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var o = t.alternate, s = e, u = t, h = u.flags;
      switch (u.tag) {
        case 0:
        case 11:
        case 15:
          zl(
            s,
            u,
            l
          ), za(4, u);
          break;
        case 1:
          if (zl(
            s,
            u,
            l
          ), o = u, s = o.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch (W) {
              yt(o, o.return, W);
            }
          if (o = u, s = o.updateQueue, s !== null) {
            var w = o.stateNode;
            try {
              var U = s.shared.hiddenCallbacks;
              if (U !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < U.length; s++)
                  Xg(U[s], w);
            } catch (W) {
              yt(o, o.return, W);
            }
          }
          l && h & 64 && lh(u), Da(u, u.return);
          break;
        case 27:
          ih(u);
        case 26:
        case 5:
          zl(
            s,
            u,
            l
          ), l && o === null && h & 4 && rh(u), Da(u, u.return);
          break;
        case 12:
          zl(
            s,
            u,
            l
          );
          break;
        case 31:
          zl(
            s,
            u,
            l
          ), l && h & 4 && dh(s, u);
          break;
        case 13:
          zl(
            s,
            u,
            l
          ), l && h & 4 && ph(s, u);
          break;
        case 22:
          u.memoizedState === null && zl(
            s,
            u,
            l
          ), Da(u, u.return);
          break;
        case 30:
          break;
        default:
          zl(
            s,
            u,
            l
          );
      }
      t = t.sibling;
    }
  }
  function pf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && ya(l));
  }
  function gf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && ya(e));
  }
  function tl(e, t, l, o) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        hh(
          e,
          t,
          l,
          o
        ), t = t.sibling;
  }
  function hh(e, t, l, o) {
    var s = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        tl(
          e,
          t,
          l,
          o
        ), s & 2048 && za(9, t);
        break;
      case 1:
        tl(
          e,
          t,
          l,
          o
        );
        break;
      case 3:
        tl(
          e,
          t,
          l,
          o
        ), s & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && ya(e)));
        break;
      case 12:
        if (s & 2048) {
          tl(
            e,
            t,
            l,
            o
          ), e = t.stateNode;
          try {
            var u = t.memoizedProps, h = u.id, w = u.onPostCommit;
            typeof w == "function" && w(
              h,
              t.alternate === null ? "mount" : "update",
              e.passiveEffectDuration,
              -0
            );
          } catch (U) {
            yt(t, t.return, U);
          }
        } else
          tl(
            e,
            t,
            l,
            o
          );
        break;
      case 31:
        tl(
          e,
          t,
          l,
          o
        );
        break;
      case 13:
        tl(
          e,
          t,
          l,
          o
        );
        break;
      case 23:
        break;
      case 22:
        u = t.stateNode, h = t.alternate, t.memoizedState !== null ? u._visibility & 2 ? tl(
          e,
          t,
          l,
          o
        ) : Na(e, t) : u._visibility & 2 ? tl(
          e,
          t,
          l,
          o
        ) : (u._visibility |= 2, _r(
          e,
          t,
          l,
          o,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), s & 2048 && pf(h, t);
        break;
      case 24:
        tl(
          e,
          t,
          l,
          o
        ), s & 2048 && gf(t.alternate, t);
        break;
      default:
        tl(
          e,
          t,
          l,
          o
        );
    }
  }
  function _r(e, t, l, o, s) {
    for (s = s && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var u = e, h = t, w = l, U = o, W = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          _r(
            u,
            h,
            w,
            U,
            s
          ), za(8, h);
          break;
        case 23:
          break;
        case 22:
          var ue = h.stateNode;
          h.memoizedState !== null ? ue._visibility & 2 ? _r(
            u,
            h,
            w,
            U,
            s
          ) : Na(
            u,
            h
          ) : (ue._visibility |= 2, _r(
            u,
            h,
            w,
            U,
            s
          )), s && W & 2048 && pf(
            h.alternate,
            h
          );
          break;
        case 24:
          _r(
            u,
            h,
            w,
            U,
            s
          ), s && W & 2048 && gf(h.alternate, h);
          break;
        default:
          _r(
            u,
            h,
            w,
            U,
            s
          );
      }
      t = t.sibling;
    }
  }
  function Na(e, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var l = e, o = t, s = o.flags;
        switch (o.tag) {
          case 22:
            Na(l, o), s & 2048 && pf(
              o.alternate,
              o
            );
            break;
          case 24:
            Na(l, o), s & 2048 && gf(o.alternate, o);
            break;
          default:
            Na(l, o);
        }
        t = t.sibling;
      }
  }
  var _a = 8192;
  function kr(e, t, l) {
    if (e.subtreeFlags & _a)
      for (e = e.child; e !== null; )
        yh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function yh(e, t, l) {
    switch (e.tag) {
      case 26:
        kr(
          e,
          t,
          l
        ), e.flags & _a && e.memoizedState !== null && _w(
          l,
          el,
          e.memoizedState,
          e.memoizedProps
        );
        break;
      case 5:
        kr(
          e,
          t,
          l
        );
        break;
      case 3:
      case 4:
        var o = el;
        el = xs(e.stateNode.containerInfo), kr(
          e,
          t,
          l
        ), el = o;
        break;
      case 22:
        e.memoizedState === null && (o = e.alternate, o !== null && o.memoizedState !== null ? (o = _a, _a = 16777216, kr(
          e,
          t,
          l
        ), _a = o) : kr(
          e,
          t,
          l
        ));
        break;
      default:
        kr(
          e,
          t,
          l
        );
    }
  }
  function bh(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function ka(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var o = t[l];
          nn = o, xh(
            o,
            e
          );
        }
      bh(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        vh(e), e = e.sibling;
  }
  function vh(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        ka(e), e.flags & 2048 && lo(9, e, e.return);
        break;
      case 3:
        ka(e);
        break;
      case 12:
        ka(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, is(e)) : ka(e);
        break;
      default:
        ka(e);
    }
  }
  function is(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var o = t[l];
          nn = o, xh(
            o,
            e
          );
        }
      bh(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          lo(8, t, t.return), is(t);
          break;
        case 22:
          l = t.stateNode, l._visibility & 2 && (l._visibility &= -3, is(t));
          break;
        default:
          is(t);
      }
      e = e.sibling;
    }
  }
  function xh(e, t) {
    for (; nn !== null; ) {
      var l = nn;
      switch (l.tag) {
        case 0:
        case 11:
        case 15:
          lo(8, l, t);
          break;
        case 23:
        case 22:
          if (l.memoizedState !== null && l.memoizedState.cachePool !== null) {
            var o = l.memoizedState.cachePool.pool;
            o != null && o.refCount++;
          }
          break;
        case 24:
          ya(l.memoizedState.cache);
      }
      if (o = l.child, o !== null) o.return = l, nn = o;
      else
        e: for (l = e; nn !== null; ) {
          o = nn;
          var s = o.sibling, u = o.return;
          if (ch(o), o === l) {
            nn = null;
            break e;
          }
          if (s !== null) {
            s.return = u, nn = s;
            break e;
          }
          nn = u;
        }
    }
  }
  var QS = {
    getCacheForType: function(e) {
      var t = un(Kt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return un(Kt).controller.signal;
    }
  }, ZS = typeof WeakMap == "function" ? WeakMap : Map, dt = 0, Tt = null, tt = null, ot = 0, ht = 0, kn = null, oo = !1, Hr = !1, mf = !1, Dl = 0, It = 0, ro = 0, Po = 0, hf = 0, Hn = 0, jr = 0, Ha = null, En = null, yf = !1, ss = 0, Sh = 0, us = 1 / 0, cs = null, ao = null, Wt = 0, io = null, Ur = null, Nl = 0, bf = 0, vf = null, wh = null, ja = 0, xf = null;
  function jn() {
    return (dt & 2) !== 0 && ot !== 0 ? ot & -ot : N.T !== null ? Cf() : qt();
  }
  function Eh() {
    if (Hn === 0)
      if ((ot & 536870912) === 0 || at) {
        var e = Ut;
        Ut <<= 1, (Ut & 3932160) === 0 && (Ut = 262144), Hn = e;
      } else Hn = 536870912;
    return e = Nn.current, e !== null && (e.flags |= 32), Hn;
  }
  function Rn(e, t, l) {
    (e === Tt && (ht === 2 || ht === 9) || e.cancelPendingCommit !== null) && (Lr(e, 0), so(
      e,
      ot,
      Hn,
      !1
    )), Gt(e, l), ((dt & 2) === 0 || e !== Tt) && (e === Tt && ((dt & 2) === 0 && (Po |= l), It === 4 && so(
      e,
      ot,
      Hn,
      !1
    )), il(e));
  }
  function Rh(e, t, l) {
    if ((dt & 6) !== 0) throw Error(i(327));
    var o = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Yt(e, t), s = o ? WS(e, t) : wf(e, t, !0), u = o;
    do {
      if (s === 0) {
        Hr && !o && so(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, u && !FS(l)) {
          s = wf(e, t, !1), u = !1;
          continue;
        }
        if (s === 2) {
          if (u = t, e.errorRecoveryDisabledLanes & u)
            var h = 0;
          else
            h = e.pendingLanes & -536870913, h = h !== 0 ? h : h & 536870912 ? 536870912 : 0;
          if (h !== 0) {
            t = h;
            e: {
              var w = e;
              s = Ha;
              var U = w.current.memoizedState.isDehydrated;
              if (U && (Lr(w, h).flags |= 256), h = wf(
                w,
                h,
                !1
              ), h !== 2) {
                if (mf && !U) {
                  w.errorRecoveryDisabledLanes |= u, Po |= u, s = 4;
                  break e;
                }
                u = En, En = s, u !== null && (En === null ? En = u : En.push.apply(
                  En,
                  u
                ));
              }
              s = h;
            }
            if (u = !1, s !== 2) continue;
          }
        }
        if (s === 1) {
          Lr(e, 0), so(e, t, 0, !0);
          break;
        }
        e: {
          switch (o = e, u = s, u) {
            case 0:
            case 1:
              throw Error(i(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              so(
                o,
                t,
                Hn,
                !oo
              );
              break e;
            case 2:
              En = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(i(329));
          }
          if ((t & 62914560) === t && (s = ss + 300 - oe(), 10 < s)) {
            if (so(
              o,
              t,
              Hn,
              !oo
            ), Dt(o, 0, !0) !== 0) break e;
            Nl = t, o.timeoutHandle = ty(
              Th.bind(
                null,
                o,
                l,
                En,
                cs,
                yf,
                t,
                Hn,
                Po,
                jr,
                oo,
                u,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          Th(
            o,
            l,
            En,
            cs,
            yf,
            t,
            Hn,
            Po,
            jr,
            oo,
            u,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    il(e);
  }
  function Th(e, t, l, o, s, u, h, w, U, W, ue, de, $, ne) {
    if (e.timeoutHandle = -1, de = t.subtreeFlags, de & 8192 || (de & 16785408) === 16785408) {
      de = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: yl
      }, yh(
        t,
        u,
        de
      );
      var ze = (u & 62914560) === u ? ss - oe() : (u & 4194048) === u ? Sh - oe() : 0;
      if (ze = kw(
        de,
        ze
      ), ze !== null) {
        Nl = u, e.cancelPendingCommit = ze(
          _h.bind(
            null,
            e,
            t,
            u,
            l,
            o,
            s,
            h,
            w,
            U,
            ue,
            de,
            null,
            $,
            ne
          )
        ), so(e, u, h, !W);
        return;
      }
    }
    _h(
      e,
      t,
      u,
      l,
      o,
      s,
      h,
      w,
      U
    );
  }
  function FS(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if ((l === 0 || l === 11 || l === 15) && t.flags & 16384 && (l = t.updateQueue, l !== null && (l = l.stores, l !== null)))
        for (var o = 0; o < l.length; o++) {
          var s = l[o], u = s.getSnapshot;
          s = s.value;
          try {
            if (!zn(u(), s)) return !1;
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
  function so(e, t, l, o) {
    t &= ~hf, t &= ~Po, e.suspendedLanes |= t, e.pingedLanes &= ~t, o && (e.warmLanes |= t), o = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var u = 31 - mt(s), h = 1 << u;
      o[u] = -1, s &= ~h;
    }
    l !== 0 && gl(e, l, t);
  }
  function fs() {
    return (dt & 6) === 0 ? (Ua(0), !1) : !0;
  }
  function Sf() {
    if (tt !== null) {
      if (ht === 0)
        var e = tt.return;
      else
        e = tt, Sl = jo = null, jc(e), Mr = null, va = 0, e = tt;
      for (; e !== null; )
        nh(e.alternate, e), e = e.return;
      tt = null;
    }
  }
  function Lr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, hw(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), Nl = 0, Sf(), Tt = e, tt = l = vl(e.current, null), ot = t, ht = 0, kn = null, oo = !1, Hr = Yt(e, t), mf = !1, jr = Hn = hf = Po = ro = It = 0, En = Ha = null, yf = !1, (t & 8) !== 0 && (t |= t & 32);
    var o = e.entangledLanes;
    if (o !== 0)
      for (e = e.entanglements, o &= t; 0 < o; ) {
        var s = 31 - mt(o), u = 1 << s;
        t |= e[s], o &= ~u;
      }
    return Dl = t, Ni(), l;
  }
  function Ch(e, t) {
    Xe = null, N.H = Oa, t === Or || t === Ii ? (t = Yg(), ht = 3) : t === Rc ? (t = Yg(), ht = 4) : ht = t === Wc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, kn = t, tt === null && (It = 1, es(
      e,
      qn(t, e.current)
    ));
  }
  function Oh() {
    var e = Nn.current;
    return e === null ? !0 : (ot & 4194048) === ot ? Qn === null : (ot & 62914560) === ot || (ot & 536870912) !== 0 ? e === Qn : !1;
  }
  function Mh() {
    var e = N.H;
    return N.H = Oa, e === null ? Oa : e;
  }
  function Ah() {
    var e = N.A;
    return N.A = QS, e;
  }
  function ds() {
    It = 4, oo || (ot & 4194048) !== ot && Nn.current !== null || (Hr = !0), (ro & 134217727) === 0 && (Po & 134217727) === 0 || Tt === null || so(
      Tt,
      ot,
      Hn,
      !1
    );
  }
  function wf(e, t, l) {
    var o = dt;
    dt |= 2;
    var s = Mh(), u = Ah();
    (Tt !== e || ot !== t) && (cs = null, Lr(e, t)), t = !1;
    var h = It;
    e: do
      try {
        if (ht !== 0 && tt !== null) {
          var w = tt, U = kn;
          switch (ht) {
            case 8:
              Sf(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              Nn.current === null && (t = !0);
              var W = ht;
              if (ht = 0, kn = null, Br(e, w, U, W), l && Hr) {
                h = 0;
                break e;
              }
              break;
            default:
              W = ht, ht = 0, kn = null, Br(e, w, U, W);
          }
        }
        JS(), h = It;
        break;
      } catch (ue) {
        Ch(e, ue);
      }
    while (!0);
    return t && e.shellSuspendCounter++, Sl = jo = null, dt = o, N.H = s, N.A = u, tt === null && (Tt = null, ot = 0, Ni()), h;
  }
  function JS() {
    for (; tt !== null; ) zh(tt);
  }
  function WS(e, t) {
    var l = dt;
    dt |= 2;
    var o = Mh(), s = Ah();
    Tt !== e || ot !== t ? (cs = null, us = oe() + 500, Lr(e, t)) : Hr = Yt(
      e,
      t
    );
    e: do
      try {
        if (ht !== 0 && tt !== null) {
          t = tt;
          var u = kn;
          t: switch (ht) {
            case 1:
              ht = 0, kn = null, Br(e, t, u, 1);
              break;
            case 2:
            case 9:
              if (Ig(u)) {
                ht = 0, kn = null, Dh(t);
                break;
              }
              t = function() {
                ht !== 2 && ht !== 9 || Tt !== e || (ht = 7), il(e);
              }, u.then(t, t);
              break e;
            case 3:
              ht = 7;
              break e;
            case 4:
              ht = 5;
              break e;
            case 7:
              Ig(u) ? (ht = 0, kn = null, Dh(t)) : (ht = 0, kn = null, Br(e, t, u, 7));
              break;
            case 5:
              var h = null;
              switch (tt.tag) {
                case 26:
                  h = tt.memoizedState;
                case 5:
                case 27:
                  var w = tt;
                  if (h ? hy(h) : w.stateNode.complete) {
                    ht = 0, kn = null;
                    var U = w.sibling;
                    if (U !== null) tt = U;
                    else {
                      var W = w.return;
                      W !== null ? (tt = W, ps(W)) : tt = null;
                    }
                    break t;
                  }
              }
              ht = 0, kn = null, Br(e, t, u, 5);
              break;
            case 6:
              ht = 0, kn = null, Br(e, t, u, 6);
              break;
            case 8:
              Sf(), It = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        $S();
        break;
      } catch (ue) {
        Ch(e, ue);
      }
    while (!0);
    return Sl = jo = null, N.H = o, N.A = s, dt = l, tt !== null ? 0 : (Tt = null, ot = 0, Ni(), It);
  }
  function $S() {
    for (; tt !== null && !Oe(); )
      zh(tt);
  }
  function zh(e) {
    var t = eh(e.alternate, e, Dl);
    e.memoizedProps = e.pendingProps, t === null ? ps(e) : tt = t;
  }
  function Dh(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Qm(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          ot
        );
        break;
      case 11:
        t = Qm(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          ot
        );
        break;
      case 5:
        jc(t);
      default:
        nh(l, t), t = tt = Ag(t, Dl), t = eh(l, t, Dl);
    }
    e.memoizedProps = e.pendingProps, t === null ? ps(e) : tt = t;
  }
  function Br(e, t, l, o) {
    Sl = jo = null, jc(t), Mr = null, va = 0;
    var s = t.return;
    try {
      if (VS(
        e,
        s,
        t,
        l,
        ot
      )) {
        It = 1, es(
          e,
          qn(l, e.current)
        ), tt = null;
        return;
      }
    } catch (u) {
      if (s !== null) throw tt = s, u;
      It = 1, es(
        e,
        qn(l, e.current)
      ), tt = null;
      return;
    }
    t.flags & 32768 ? (at || o === 1 ? e = !0 : Hr || (ot & 536870912) !== 0 ? e = !1 : (oo = e = !0, (o === 2 || o === 9 || o === 3 || o === 6) && (o = Nn.current, o !== null && o.tag === 13 && (o.flags |= 16384))), Nh(t, e)) : ps(t);
  }
  function ps(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        Nh(
          t,
          oo
        );
        return;
      }
      e = t.return;
      var l = qS(
        t.alternate,
        t,
        Dl
      );
      if (l !== null) {
        tt = l;
        return;
      }
      if (t = t.sibling, t !== null) {
        tt = t;
        return;
      }
      tt = t = e;
    } while (t !== null);
    It === 0 && (It = 5);
  }
  function Nh(e, t) {
    do {
      var l = PS(e.alternate, e);
      if (l !== null) {
        l.flags &= 32767, tt = l;
        return;
      }
      if (l = e.return, l !== null && (l.flags |= 32768, l.subtreeFlags = 0, l.deletions = null), !t && (e = e.sibling, e !== null)) {
        tt = e;
        return;
      }
      tt = e = l;
    } while (e !== null);
    It = 6, tt = null;
  }
  function _h(e, t, l, o, s, u, h, w, U) {
    e.cancelPendingCommit = null;
    do
      gs();
    while (Wt !== 0);
    if ((dt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (u = t.lanes | t.childLanes, u |= uc, In(
        e,
        l,
        u,
        h,
        w,
        U
      ), e === Tt && (tt = Tt = null, ot = 0), Ur = t, io = e, Nl = l, bf = u, vf = s, wh = o, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, lw(ve, function() {
        return Lh(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), o = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || o) {
        o = N.T, N.T = null, s = Y.p, Y.p = 2, h = dt, dt |= 4;
        try {
          XS(e, t, l);
        } finally {
          dt = h, Y.p = s, N.T = o;
        }
      }
      Wt = 1, kh(), Hh(), jh();
    }
  }
  function kh() {
    if (Wt === 1) {
      Wt = 0;
      var e = io, t = Ur, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = N.T, N.T = null;
        var o = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          gh(t, e);
          var u = kf, h = xg(e.containerInfo), w = u.focusedElem, U = u.selectionRange;
          if (h !== w && w && w.ownerDocument && vg(
            w.ownerDocument.documentElement,
            w
          )) {
            if (U !== null && oc(w)) {
              var W = U.start, ue = U.end;
              if (ue === void 0 && (ue = W), "selectionStart" in w)
                w.selectionStart = W, w.selectionEnd = Math.min(
                  ue,
                  w.value.length
                );
              else {
                var de = w.ownerDocument || document, $ = de && de.defaultView || window;
                if ($.getSelection) {
                  var ne = $.getSelection(), ze = w.textContent.length, Ve = Math.min(U.start, ze), St = U.end === void 0 ? Ve : Math.min(U.end, ze);
                  !ne.extend && Ve > St && (h = St, St = Ve, Ve = h);
                  var P = bg(
                    w,
                    Ve
                  ), V = bg(
                    w,
                    St
                  );
                  if (P && V && (ne.rangeCount !== 1 || ne.anchorNode !== P.node || ne.anchorOffset !== P.offset || ne.focusNode !== V.node || ne.focusOffset !== V.offset)) {
                    var F = de.createRange();
                    F.setStart(P.node, P.offset), ne.removeAllRanges(), Ve > St ? (ne.addRange(F), ne.extend(V.node, V.offset)) : (F.setEnd(V.node, V.offset), ne.addRange(F));
                  }
                }
              }
            }
            for (de = [], ne = w; ne = ne.parentNode; )
              ne.nodeType === 1 && de.push({
                element: ne,
                left: ne.scrollLeft,
                top: ne.scrollTop
              });
            for (typeof w.focus == "function" && w.focus(), w = 0; w < de.length; w++) {
              var ce = de[w];
              ce.element.scrollLeft = ce.left, ce.element.scrollTop = ce.top;
            }
          }
          Cs = !!_f, kf = _f = null;
        } finally {
          dt = s, Y.p = o, N.T = l;
        }
      }
      e.current = t, Wt = 2;
    }
  }
  function Hh() {
    if (Wt === 2) {
      Wt = 0;
      var e = io, t = Ur, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = N.T, N.T = null;
        var o = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          uh(e, t.alternate, t);
        } finally {
          dt = s, Y.p = o, N.T = l;
        }
      }
      Wt = 3;
    }
  }
  function jh() {
    if (Wt === 4 || Wt === 3) {
      Wt = 0, je();
      var e = io, t = Ur, l = Nl, o = wh;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Wt = 5 : (Wt = 0, Ur = io = null, Uh(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (ao = null), bt(l), t = t.stateNode, gt && typeof gt.onCommitFiberRoot == "function")
        try {
          gt.onCommitFiberRoot(
            $e,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (o !== null) {
        t = N.T, s = Y.p, Y.p = 2, N.T = null;
        try {
          for (var u = e.onRecoverableError, h = 0; h < o.length; h++) {
            var w = o[h];
            u(w.value, {
              componentStack: w.stack
            });
          }
        } finally {
          N.T = t, Y.p = s;
        }
      }
      (Nl & 3) !== 0 && gs(), il(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === xf ? ja++ : (ja = 0, xf = e) : ja = 0, Ua(0);
    }
  }
  function Uh(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, ya(t)));
  }
  function gs() {
    return kh(), Hh(), jh(), Lh();
  }
  function Lh() {
    if (Wt !== 5) return !1;
    var e = io, t = bf;
    bf = 0;
    var l = bt(Nl), o = N.T, s = Y.p;
    try {
      Y.p = 32 > l ? 32 : l, N.T = null, l = vf, vf = null;
      var u = io, h = Nl;
      if (Wt = 0, Ur = io = null, Nl = 0, (dt & 6) !== 0) throw Error(i(331));
      var w = dt;
      if (dt |= 4, vh(u.current), hh(
        u,
        u.current,
        h,
        l
      ), dt = w, Ua(0, !1), gt && typeof gt.onPostCommitFiberRoot == "function")
        try {
          gt.onPostCommitFiberRoot($e, u);
        } catch {
        }
      return !0;
    } finally {
      Y.p = s, N.T = o, Uh(e, t);
    }
  }
  function Bh(e, t, l) {
    t = qn(l, t), t = Jc(e.stateNode, t, 2), e = eo(e, t, 2), e !== null && (Gt(e, 2), il(e));
  }
  function yt(e, t, l) {
    if (e.tag === 3)
      Bh(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Bh(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var o = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof o.componentDidCatch == "function" && (ao === null || !ao.has(o))) {
            e = qn(l, e), l = Im(2), o = eo(t, l, 2), o !== null && (Vm(
              l,
              o,
              t,
              e
            ), Gt(o, 2), il(o));
            break;
          }
        }
        t = t.return;
      }
  }
  function Ef(e, t, l) {
    var o = e.pingCache;
    if (o === null) {
      o = e.pingCache = new ZS();
      var s = /* @__PURE__ */ new Set();
      o.set(t, s);
    } else
      s = o.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), o.set(t, s));
    s.has(l) || (mf = !0, s.add(l), e = ew.bind(null, e, t, l), t.then(e, e));
  }
  function ew(e, t, l) {
    var o = e.pingCache;
    o !== null && o.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Tt === e && (ot & l) === l && (It === 4 || It === 3 && (ot & 62914560) === ot && 300 > oe() - ss ? (dt & 2) === 0 && Lr(e, 0) : hf |= l, jr === ot && (jr = 0)), il(e);
  }
  function Ih(e, t) {
    t === 0 && (t = An()), e = _o(e, t), e !== null && (Gt(e, t), il(e));
  }
  function tw(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), Ih(e, l);
  }
  function nw(e, t) {
    var l = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var o = e.stateNode, s = e.memoizedState;
        s !== null && (l = s.retryLane);
        break;
      case 19:
        o = e.stateNode;
        break;
      case 22:
        o = e.stateNode._retryCache;
        break;
      default:
        throw Error(i(314));
    }
    o !== null && o.delete(t), Ih(e, l);
  }
  function lw(e, t) {
    return Se(e, t);
  }
  var ms = null, Ir = null, Rf = !1, hs = !1, Tf = !1, uo = 0;
  function il(e) {
    e !== Ir && e.next === null && (Ir === null ? ms = Ir = e : Ir = Ir.next = e), hs = !0, Rf || (Rf = !0, rw());
  }
  function Ua(e, t) {
    if (!Tf && hs) {
      Tf = !0;
      do
        for (var l = !1, o = ms; o !== null; ) {
          if (e !== 0) {
            var s = o.pendingLanes;
            if (s === 0) var u = 0;
            else {
              var h = o.suspendedLanes, w = o.pingedLanes;
              u = (1 << 31 - mt(42 | e) + 1) - 1, u &= s & ~(h & ~w), u = u & 201326741 ? u & 201326741 | 1 : u ? u | 2 : 0;
            }
            u !== 0 && (l = !0, qh(o, u));
          } else
            u = ot, u = Dt(
              o,
              o === Tt ? u : 0,
              o.cancelPendingCommit !== null || o.timeoutHandle !== -1
            ), (u & 3) === 0 || Yt(o, u) || (l = !0, qh(o, u));
          o = o.next;
        }
      while (l);
      Tf = !1;
    }
  }
  function ow() {
    Vh();
  }
  function Vh() {
    hs = Rf = !1;
    var e = 0;
    uo !== 0 && mw() && (e = uo);
    for (var t = oe(), l = null, o = ms; o !== null; ) {
      var s = o.next, u = Yh(o, t);
      u === 0 ? (o.next = null, l === null ? ms = s : l.next = s, s === null && (Ir = l)) : (l = o, (e !== 0 || (u & 3) !== 0) && (hs = !0)), o = s;
    }
    Wt !== 0 && Wt !== 5 || Ua(e), uo !== 0 && (uo = 0);
  }
  function Yh(e, t) {
    for (var l = e.suspendedLanes, o = e.pingedLanes, s = e.expirationTimes, u = e.pendingLanes & -62914561; 0 < u; ) {
      var h = 31 - mt(u), w = 1 << h, U = s[h];
      U === -1 ? ((w & l) === 0 || (w & o) !== 0) && (s[h] = bn(w, t)) : U <= t && (e.expiredLanes |= w), u &= ~w;
    }
    if (t = Tt, l = ot, l = Dt(
      e,
      e === t ? l : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), o = e.callbackNode, l === 0 || e === t && (ht === 2 || ht === 9) || e.cancelPendingCommit !== null)
      return o !== null && o !== null && Re(o), e.callbackNode = null, e.callbackPriority = 0;
    if ((l & 3) === 0 || Yt(e, l)) {
      if (t = l & -l, t === e.callbackPriority) return t;
      switch (o !== null && Re(o), bt(l)) {
        case 2:
        case 8:
          l = be;
          break;
        case 32:
          l = ve;
          break;
        case 268435456:
          l = lt;
          break;
        default:
          l = ve;
      }
      return o = Gh.bind(null, e), l = Se(l, o), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return o !== null && o !== null && Re(o), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function Gh(e, t) {
    if (Wt !== 0 && Wt !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (gs() && e.callbackNode !== l)
      return null;
    var o = ot;
    return o = Dt(
      e,
      e === Tt ? o : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), o === 0 ? null : (Rh(e, o, t), Yh(e, oe()), e.callbackNode != null && e.callbackNode === l ? Gh.bind(null, e) : null);
  }
  function qh(e, t) {
    if (gs()) return null;
    Rh(e, t, !0);
  }
  function rw() {
    yw(function() {
      (dt & 6) !== 0 ? Se(
        Ue,
        ow
      ) : Vh();
    });
  }
  function Cf() {
    if (uo === 0) {
      var e = Tr;
      e === 0 && (e = ft, ft <<= 1, (ft & 261888) === 0 && (ft = 256)), uo = e;
    }
    return uo;
  }
  function Ph(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Ri("" + e);
  }
  function Xh(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function aw(e, t, l, o, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var u = Ph(
        (s[an] || null).action
      ), h = o.submitter;
      h && (t = (t = h[an] || null) ? Ph(t.formAction) : h.getAttribute("formAction"), t !== null && (u = t, h = null));
      var w = new Mi(
        "action",
        "action",
        null,
        o,
        s
      );
      e.push({
        event: w,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (o.defaultPrevented) {
                if (uo !== 0) {
                  var U = h ? Xh(s, h) : new FormData(s);
                  Pc(
                    l,
                    {
                      pending: !0,
                      data: U,
                      method: s.method,
                      action: u
                    },
                    null,
                    U
                  );
                }
              } else
                typeof u == "function" && (w.preventDefault(), U = h ? Xh(s, h) : new FormData(s), Pc(
                  l,
                  {
                    pending: !0,
                    data: U,
                    method: s.method,
                    action: u
                  },
                  u,
                  U
                ));
            },
            currentTarget: s
          }
        ]
      });
    }
  }
  for (var Of = 0; Of < sc.length; Of++) {
    var Mf = sc[Of], iw = Mf.toLowerCase(), sw = Mf[0].toUpperCase() + Mf.slice(1);
    $n(
      iw,
      "on" + sw
    );
  }
  $n(Eg, "onAnimationEnd"), $n(Rg, "onAnimationIteration"), $n(Tg, "onAnimationStart"), $n("dblclick", "onDoubleClick"), $n("focusin", "onFocus"), $n("focusout", "onBlur"), $n(RS, "onTransitionRun"), $n(TS, "onTransitionStart"), $n(CS, "onTransitionCancel"), $n(Cg, "onTransitionEnd"), fr("onMouseEnter", ["mouseout", "mouseover"]), fr("onMouseLeave", ["mouseout", "mouseover"]), fr("onPointerEnter", ["pointerout", "pointerover"]), fr("onPointerLeave", ["pointerout", "pointerover"]), Ao(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Ao(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Ao("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ao(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Ao(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Ao(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var La = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), uw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(La)
  );
  function Kh(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var o = e[l], s = o.event;
      o = o.listeners;
      e: {
        var u = void 0;
        if (t)
          for (var h = o.length - 1; 0 <= h; h--) {
            var w = o[h], U = w.instance, W = w.currentTarget;
            if (w = w.listener, U !== u && s.isPropagationStopped())
              break e;
            u = w, s.currentTarget = W;
            try {
              u(s);
            } catch (ue) {
              Di(ue);
            }
            s.currentTarget = null, u = U;
          }
        else
          for (h = 0; h < o.length; h++) {
            if (w = o[h], U = w.instance, W = w.currentTarget, w = w.listener, U !== u && s.isPropagationStopped())
              break e;
            u = w, s.currentTarget = W;
            try {
              u(s);
            } catch (ue) {
              Di(ue);
            }
            s.currentTarget = null, u = U;
          }
      }
    }
  }
  function nt(e, t) {
    var l = t[la];
    l === void 0 && (l = t[la] = /* @__PURE__ */ new Set());
    var o = e + "__bubble";
    l.has(o) || (Qh(t, e, 2, !1), l.add(o));
  }
  function Af(e, t, l) {
    var o = 0;
    t && (o |= 4), Qh(
      l,
      e,
      o,
      t
    );
  }
  var ys = "_reactListening" + Math.random().toString(36).slice(2);
  function zf(e) {
    if (!e[ys]) {
      e[ys] = !0, Vp.forEach(function(l) {
        l !== "selectionchange" && (uw.has(l) || Af(l, !1, e), Af(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[ys] || (t[ys] = !0, Af("selectionchange", !1, t));
    }
  }
  function Qh(e, t, l, o) {
    switch (Ey(t)) {
      case 2:
        var s = Uw;
        break;
      case 8:
        s = Lw;
        break;
      default:
        s = Pf;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !Zu || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), o ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function Df(e, t, l, o, s) {
    var u = o;
    if ((t & 1) === 0 && (t & 2) === 0 && o !== null)
      e: for (; ; ) {
        if (o === null) return;
        var h = o.tag;
        if (h === 3 || h === 4) {
          var w = o.stateNode.containerInfo;
          if (w === s) break;
          if (h === 4)
            for (h = o.return; h !== null; ) {
              var U = h.tag;
              if ((U === 3 || U === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; w !== null; ) {
            if (h = sr(w), h === null) return;
            if (U = h.tag, U === 5 || U === 6 || U === 26 || U === 27) {
              o = u = h;
              continue e;
            }
            w = w.parentNode;
          }
        }
        o = o.return;
      }
    $p(function() {
      var W = u, ue = Ku(l), de = [];
      e: {
        var $ = Og.get(e);
        if ($ !== void 0) {
          var ne = Mi, ze = e;
          switch (e) {
            case "keypress":
              if (Ci(l) === 0) break e;
            case "keydown":
            case "keyup":
              ne = nS;
              break;
            case "focusin":
              ze = "focus", ne = $u;
              break;
            case "focusout":
              ze = "blur", ne = $u;
              break;
            case "beforeblur":
            case "afterblur":
              ne = $u;
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
              ne = ng;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              ne = qx;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              ne = rS;
              break;
            case Eg:
            case Rg:
            case Tg:
              ne = Kx;
              break;
            case Cg:
              ne = iS;
              break;
            case "scroll":
            case "scrollend":
              ne = Yx;
              break;
            case "wheel":
              ne = uS;
              break;
            case "copy":
            case "cut":
            case "paste":
              ne = Zx;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              ne = og;
              break;
            case "toggle":
            case "beforetoggle":
              ne = fS;
          }
          var Ve = (t & 4) !== 0, St = !Ve && (e === "scroll" || e === "scrollend"), P = Ve ? $ !== null ? $ + "Capture" : null : $;
          Ve = [];
          for (var V = W, F; V !== null; ) {
            var ce = V;
            if (F = ce.stateNode, ce = ce.tag, ce !== 5 && ce !== 26 && ce !== 27 || F === null || P === null || (ce = aa(V, P), ce != null && Ve.push(
              Ba(V, ce, F)
            )), St) break;
            V = V.return;
          }
          0 < Ve.length && ($ = new ne(
            $,
            ze,
            null,
            l,
            ue
          ), de.push({ event: $, listeners: Ve }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if ($ = e === "mouseover" || e === "pointerover", ne = e === "mouseout" || e === "pointerout", $ && l !== Xu && (ze = l.relatedTarget || l.fromElement) && (sr(ze) || ze[ll]))
            break e;
          if ((ne || $) && ($ = ue.window === ue ? ue : ($ = ue.ownerDocument) ? $.defaultView || $.parentWindow : window, ne ? (ze = l.relatedTarget || l.toElement, ne = W, ze = ze ? sr(ze) : null, ze !== null && (St = f(ze), Ve = ze.tag, ze !== St || Ve !== 5 && Ve !== 27 && Ve !== 6) && (ze = null)) : (ne = null, ze = W), ne !== ze)) {
            if (Ve = ng, ce = "onMouseLeave", P = "onMouseEnter", V = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = og, ce = "onPointerLeave", P = "onPointerEnter", V = "pointer"), St = ne == null ? $ : ra(ne), F = ze == null ? $ : ra(ze), $ = new Ve(
              ce,
              V + "leave",
              ne,
              l,
              ue
            ), $.target = St, $.relatedTarget = F, ce = null, sr(ue) === W && (Ve = new Ve(
              P,
              V + "enter",
              ze,
              l,
              ue
            ), Ve.target = F, Ve.relatedTarget = St, ce = Ve), St = ce, ne && ze)
              t: {
                for (Ve = cw, P = ne, V = ze, F = 0, ce = P; ce; ce = Ve(ce))
                  F++;
                ce = 0;
                for (var Be = V; Be; Be = Ve(Be))
                  ce++;
                for (; 0 < F - ce; )
                  P = Ve(P), F--;
                for (; 0 < ce - F; )
                  V = Ve(V), ce--;
                for (; F--; ) {
                  if (P === V || V !== null && P === V.alternate) {
                    Ve = P;
                    break t;
                  }
                  P = Ve(P), V = Ve(V);
                }
                Ve = null;
              }
            else Ve = null;
            ne !== null && Zh(
              de,
              $,
              ne,
              Ve,
              !1
            ), ze !== null && St !== null && Zh(
              de,
              St,
              ze,
              Ve,
              !0
            );
          }
        }
        e: {
          if ($ = W ? ra(W) : window, ne = $.nodeName && $.nodeName.toLowerCase(), ne === "select" || ne === "input" && $.type === "file")
            var ut = dg;
          else if (cg($))
            if (pg)
              ut = SS;
            else {
              ut = vS;
              var Ne = bS;
            }
          else
            ne = $.nodeName, !ne || ne.toLowerCase() !== "input" || $.type !== "checkbox" && $.type !== "radio" ? W && Pu(W.elementType) && (ut = dg) : ut = xS;
          if (ut && (ut = ut(e, W))) {
            fg(
              de,
              ut,
              l,
              ue
            );
            break e;
          }
          Ne && Ne(e, $, W), e === "focusout" && W && $.type === "number" && W.memoizedProps.value != null && qu($, "number", $.value);
        }
        switch (Ne = W ? ra(W) : window, e) {
          case "focusin":
            (cg(Ne) || Ne.contentEditable === "true") && (yr = Ne, rc = W, ga = null);
            break;
          case "focusout":
            ga = rc = yr = null;
            break;
          case "mousedown":
            ac = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            ac = !1, Sg(de, l, ue);
            break;
          case "selectionchange":
            if (ES) break;
          case "keydown":
          case "keyup":
            Sg(de, l, ue);
        }
        var Ke;
        if (tc)
          e: {
            switch (e) {
              case "compositionstart":
                var rt = "onCompositionStart";
                break e;
              case "compositionend":
                rt = "onCompositionEnd";
                break e;
              case "compositionupdate":
                rt = "onCompositionUpdate";
                break e;
            }
            rt = void 0;
          }
        else
          hr ? sg(e, l) && (rt = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (rt = "onCompositionStart");
        rt && (rg && l.locale !== "ko" && (hr || rt !== "onCompositionStart" ? rt === "onCompositionEnd" && hr && (Ke = eg()) : (Kl = ue, Fu = "value" in Kl ? Kl.value : Kl.textContent, hr = !0)), Ne = bs(W, rt), 0 < Ne.length && (rt = new lg(
          rt,
          e,
          null,
          l,
          ue
        ), de.push({ event: rt, listeners: Ne }), Ke ? rt.data = Ke : (Ke = ug(l), Ke !== null && (rt.data = Ke)))), (Ke = pS ? gS(e, l) : mS(e, l)) && (rt = bs(W, "onBeforeInput"), 0 < rt.length && (Ne = new lg(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ue
        ), de.push({
          event: Ne,
          listeners: rt
        }), Ne.data = Ke)), aw(
          de,
          e,
          W,
          l,
          ue
        );
      }
      Kh(de, t);
    });
  }
  function Ba(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function bs(e, t) {
    for (var l = t + "Capture", o = []; e !== null; ) {
      var s = e, u = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || u === null || (s = aa(e, l), s != null && o.unshift(
        Ba(e, s, u)
      ), s = aa(e, t), s != null && o.push(
        Ba(e, s, u)
      )), e.tag === 3) return o;
      e = e.return;
    }
    return [];
  }
  function cw(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function Zh(e, t, l, o, s) {
    for (var u = t._reactName, h = []; l !== null && l !== o; ) {
      var w = l, U = w.alternate, W = w.stateNode;
      if (w = w.tag, U !== null && U === o) break;
      w !== 5 && w !== 26 && w !== 27 || W === null || (U = W, s ? (W = aa(l, u), W != null && h.unshift(
        Ba(l, W, U)
      )) : s || (W = aa(l, u), W != null && h.push(
        Ba(l, W, U)
      ))), l = l.return;
    }
    h.length !== 0 && e.push({ event: t, listeners: h });
  }
  var fw = /\r\n?/g, dw = /\u0000|\uFFFD/g;
  function Fh(e) {
    return (typeof e == "string" ? e : "" + e).replace(fw, `
`).replace(dw, "");
  }
  function Jh(e, t) {
    return t = Fh(t), Fh(e) === t;
  }
  function xt(e, t, l, o, s, u) {
    switch (l) {
      case "children":
        typeof o == "string" ? t === "body" || t === "textarea" && o === "" || pr(e, o) : (typeof o == "number" || typeof o == "bigint") && t !== "body" && pr(e, "" + o);
        break;
      case "className":
        wi(e, "class", o);
        break;
      case "tabIndex":
        wi(e, "tabindex", o);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        wi(e, l, o);
        break;
      case "style":
        Jp(e, o, u);
        break;
      case "data":
        if (t !== "object") {
          wi(e, "data", o);
          break;
        }
      case "src":
      case "href":
        if (o === "" && (t !== "a" || l !== "href")) {
          e.removeAttribute(l);
          break;
        }
        if (o == null || typeof o == "function" || typeof o == "symbol" || typeof o == "boolean") {
          e.removeAttribute(l);
          break;
        }
        o = Ri("" + o), e.setAttribute(l, o);
        break;
      case "action":
      case "formAction":
        if (typeof o == "function") {
          e.setAttribute(
            l,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof u == "function" && (l === "formAction" ? (t !== "input" && xt(e, t, "name", s.name, s, null), xt(
            e,
            t,
            "formEncType",
            s.formEncType,
            s,
            null
          ), xt(
            e,
            t,
            "formMethod",
            s.formMethod,
            s,
            null
          ), xt(
            e,
            t,
            "formTarget",
            s.formTarget,
            s,
            null
          )) : (xt(e, t, "encType", s.encType, s, null), xt(e, t, "method", s.method, s, null), xt(e, t, "target", s.target, s, null)));
        if (o == null || typeof o == "symbol" || typeof o == "boolean") {
          e.removeAttribute(l);
          break;
        }
        o = Ri("" + o), e.setAttribute(l, o);
        break;
      case "onClick":
        o != null && (e.onclick = yl);
        break;
      case "onScroll":
        o != null && nt("scroll", e);
        break;
      case "onScrollEnd":
        o != null && nt("scrollend", e);
        break;
      case "dangerouslySetInnerHTML":
        if (o != null) {
          if (typeof o != "object" || !("__html" in o))
            throw Error(i(61));
          if (l = o.__html, l != null) {
            if (s.children != null) throw Error(i(60));
            e.innerHTML = l;
          }
        }
        break;
      case "multiple":
        e.multiple = o && typeof o != "function" && typeof o != "symbol";
        break;
      case "muted":
        e.muted = o && typeof o != "function" && typeof o != "symbol";
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
        if (o == null || typeof o == "function" || typeof o == "boolean" || typeof o == "symbol") {
          e.removeAttribute("xlink:href");
          break;
        }
        l = Ri("" + o), e.setAttributeNS(
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
        o != null && typeof o != "function" && typeof o != "symbol" ? e.setAttribute(l, "" + o) : e.removeAttribute(l);
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
        o && typeof o != "function" && typeof o != "symbol" ? e.setAttribute(l, "") : e.removeAttribute(l);
        break;
      case "capture":
      case "download":
        o === !0 ? e.setAttribute(l, "") : o !== !1 && o != null && typeof o != "function" && typeof o != "symbol" ? e.setAttribute(l, o) : e.removeAttribute(l);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        o != null && typeof o != "function" && typeof o != "symbol" && !isNaN(o) && 1 <= o ? e.setAttribute(l, o) : e.removeAttribute(l);
        break;
      case "rowSpan":
      case "start":
        o == null || typeof o == "function" || typeof o == "symbol" || isNaN(o) ? e.removeAttribute(l) : e.setAttribute(l, o);
        break;
      case "popover":
        nt("beforetoggle", e), nt("toggle", e), Si(e, "popover", o);
        break;
      case "xlinkActuate":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          o
        );
        break;
      case "xlinkArcrole":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          o
        );
        break;
      case "xlinkRole":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          o
        );
        break;
      case "xlinkShow":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          o
        );
        break;
      case "xlinkTitle":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          o
        );
        break;
      case "xlinkType":
        hl(
          e,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          o
        );
        break;
      case "xmlBase":
        hl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          o
        );
        break;
      case "xmlLang":
        hl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          o
        );
        break;
      case "xmlSpace":
        hl(
          e,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          o
        );
        break;
      case "is":
        Si(e, "is", o);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = Ix.get(l) || l, Si(e, l, o));
    }
  }
  function Nf(e, t, l, o, s, u) {
    switch (l) {
      case "style":
        Jp(e, o, u);
        break;
      case "dangerouslySetInnerHTML":
        if (o != null) {
          if (typeof o != "object" || !("__html" in o))
            throw Error(i(61));
          if (l = o.__html, l != null) {
            if (s.children != null) throw Error(i(60));
            e.innerHTML = l;
          }
        }
        break;
      case "children":
        typeof o == "string" ? pr(e, o) : (typeof o == "number" || typeof o == "bigint") && pr(e, "" + o);
        break;
      case "onScroll":
        o != null && nt("scroll", e);
        break;
      case "onScrollEnd":
        o != null && nt("scrollend", e);
        break;
      case "onClick":
        o != null && (e.onclick = yl);
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
        if (!Yp.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), u = e[an] || null, u = u != null ? u[l] : null, typeof u == "function" && e.removeEventListener(t, u, s), typeof o == "function")) {
              typeof u != "function" && u !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, o, s);
              break e;
            }
            l in e ? e[l] = o : o === !0 ? e.setAttribute(l, "") : Si(e, l, o);
          }
    }
  }
  function fn(e, t, l) {
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
        nt("error", e), nt("load", e);
        var o = !1, s = !1, u;
        for (u in l)
          if (l.hasOwnProperty(u)) {
            var h = l[u];
            if (h != null)
              switch (u) {
                case "src":
                  o = !0;
                  break;
                case "srcSet":
                  s = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(i(137, t));
                default:
                  xt(e, t, u, h, l, null);
              }
          }
        s && xt(e, t, "srcSet", l.srcSet, l, null), o && xt(e, t, "src", l.src, l, null);
        return;
      case "input":
        nt("invalid", e);
        var w = u = h = s = null, U = null, W = null;
        for (o in l)
          if (l.hasOwnProperty(o)) {
            var ue = l[o];
            if (ue != null)
              switch (o) {
                case "name":
                  s = ue;
                  break;
                case "type":
                  h = ue;
                  break;
                case "checked":
                  U = ue;
                  break;
                case "defaultChecked":
                  W = ue;
                  break;
                case "value":
                  u = ue;
                  break;
                case "defaultValue":
                  w = ue;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (ue != null)
                    throw Error(i(137, t));
                  break;
                default:
                  xt(e, t, o, ue, l, null);
              }
          }
        Kp(
          e,
          u,
          w,
          U,
          W,
          h,
          s,
          !1
        );
        return;
      case "select":
        nt("invalid", e), o = h = u = null;
        for (s in l)
          if (l.hasOwnProperty(s) && (w = l[s], w != null))
            switch (s) {
              case "value":
                u = w;
                break;
              case "defaultValue":
                h = w;
                break;
              case "multiple":
                o = w;
              default:
                xt(e, t, s, w, l, null);
            }
        t = u, l = h, e.multiple = !!o, t != null ? dr(e, !!o, t, !1) : l != null && dr(e, !!o, l, !0);
        return;
      case "textarea":
        nt("invalid", e), u = s = o = null;
        for (h in l)
          if (l.hasOwnProperty(h) && (w = l[h], w != null))
            switch (h) {
              case "value":
                o = w;
                break;
              case "defaultValue":
                s = w;
                break;
              case "children":
                u = w;
                break;
              case "dangerouslySetInnerHTML":
                if (w != null) throw Error(i(91));
                break;
              default:
                xt(e, t, h, w, l, null);
            }
        Zp(e, o, s, u);
        return;
      case "option":
        for (U in l)
          l.hasOwnProperty(U) && (o = l[U], o != null) && (U === "selected" ? e.selected = o && typeof o != "function" && typeof o != "symbol" : xt(e, t, U, o, l, null));
        return;
      case "dialog":
        nt("beforetoggle", e), nt("toggle", e), nt("cancel", e), nt("close", e);
        break;
      case "iframe":
      case "object":
        nt("load", e);
        break;
      case "video":
      case "audio":
        for (o = 0; o < La.length; o++)
          nt(La[o], e);
        break;
      case "image":
        nt("error", e), nt("load", e);
        break;
      case "details":
        nt("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        nt("error", e), nt("load", e);
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
          if (l.hasOwnProperty(W) && (o = l[W], o != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(i(137, t));
              default:
                xt(e, t, W, o, l, null);
            }
        return;
      default:
        if (Pu(t)) {
          for (ue in l)
            l.hasOwnProperty(ue) && (o = l[ue], o !== void 0 && Nf(
              e,
              t,
              ue,
              o,
              l,
              void 0
            ));
          return;
        }
    }
    for (w in l)
      l.hasOwnProperty(w) && (o = l[w], o != null && xt(e, t, w, o, l, null));
  }
  function pw(e, t, l, o) {
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
        var s = null, u = null, h = null, w = null, U = null, W = null, ue = null;
        for (ne in l) {
          var de = l[ne];
          if (l.hasOwnProperty(ne) && de != null)
            switch (ne) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                U = de;
              default:
                o.hasOwnProperty(ne) || xt(e, t, ne, null, o, de);
            }
        }
        for (var $ in o) {
          var ne = o[$];
          if (de = l[$], o.hasOwnProperty($) && (ne != null || de != null))
            switch ($) {
              case "type":
                u = ne;
                break;
              case "name":
                s = ne;
                break;
              case "checked":
                W = ne;
                break;
              case "defaultChecked":
                ue = ne;
                break;
              case "value":
                h = ne;
                break;
              case "defaultValue":
                w = ne;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (ne != null)
                  throw Error(i(137, t));
                break;
              default:
                ne !== de && xt(
                  e,
                  t,
                  $,
                  ne,
                  o,
                  de
                );
            }
        }
        Gu(
          e,
          h,
          w,
          U,
          W,
          ue,
          u,
          s
        );
        return;
      case "select":
        ne = h = w = $ = null;
        for (u in l)
          if (U = l[u], l.hasOwnProperty(u) && U != null)
            switch (u) {
              case "value":
                break;
              case "multiple":
                ne = U;
              default:
                o.hasOwnProperty(u) || xt(
                  e,
                  t,
                  u,
                  null,
                  o,
                  U
                );
            }
        for (s in o)
          if (u = o[s], U = l[s], o.hasOwnProperty(s) && (u != null || U != null))
            switch (s) {
              case "value":
                $ = u;
                break;
              case "defaultValue":
                w = u;
                break;
              case "multiple":
                h = u;
              default:
                u !== U && xt(
                  e,
                  t,
                  s,
                  u,
                  o,
                  U
                );
            }
        t = w, l = h, o = ne, $ != null ? dr(e, !!l, $, !1) : !!o != !!l && (t != null ? dr(e, !!l, t, !0) : dr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        ne = $ = null;
        for (w in l)
          if (s = l[w], l.hasOwnProperty(w) && s != null && !o.hasOwnProperty(w))
            switch (w) {
              case "value":
                break;
              case "children":
                break;
              default:
                xt(e, t, w, null, o, s);
            }
        for (h in o)
          if (s = o[h], u = l[h], o.hasOwnProperty(h) && (s != null || u != null))
            switch (h) {
              case "value":
                $ = s;
                break;
              case "defaultValue":
                ne = s;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (s != null) throw Error(i(91));
                break;
              default:
                s !== u && xt(e, t, h, s, o, u);
            }
        Qp(e, $, ne);
        return;
      case "option":
        for (var ze in l)
          $ = l[ze], l.hasOwnProperty(ze) && $ != null && !o.hasOwnProperty(ze) && (ze === "selected" ? e.selected = !1 : xt(
            e,
            t,
            ze,
            null,
            o,
            $
          ));
        for (U in o)
          $ = o[U], ne = l[U], o.hasOwnProperty(U) && $ !== ne && ($ != null || ne != null) && (U === "selected" ? e.selected = $ && typeof $ != "function" && typeof $ != "symbol" : xt(
            e,
            t,
            U,
            $,
            o,
            ne
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
          $ = l[Ve], l.hasOwnProperty(Ve) && $ != null && !o.hasOwnProperty(Ve) && xt(e, t, Ve, null, o, $);
        for (W in o)
          if ($ = o[W], ne = l[W], o.hasOwnProperty(W) && $ !== ne && ($ != null || ne != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                if ($ != null)
                  throw Error(i(137, t));
                break;
              default:
                xt(
                  e,
                  t,
                  W,
                  $,
                  o,
                  ne
                );
            }
        return;
      default:
        if (Pu(t)) {
          for (var St in l)
            $ = l[St], l.hasOwnProperty(St) && $ !== void 0 && !o.hasOwnProperty(St) && Nf(
              e,
              t,
              St,
              void 0,
              o,
              $
            );
          for (ue in o)
            $ = o[ue], ne = l[ue], !o.hasOwnProperty(ue) || $ === ne || $ === void 0 && ne === void 0 || Nf(
              e,
              t,
              ue,
              $,
              o,
              ne
            );
          return;
        }
    }
    for (var P in l)
      $ = l[P], l.hasOwnProperty(P) && $ != null && !o.hasOwnProperty(P) && xt(e, t, P, null, o, $);
    for (de in o)
      $ = o[de], ne = l[de], !o.hasOwnProperty(de) || $ === ne || $ == null && ne == null || xt(e, t, de, $, o, ne);
  }
  function Wh(e) {
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
  function gw() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), o = 0; o < l.length; o++) {
        var s = l[o], u = s.transferSize, h = s.initiatorType, w = s.duration;
        if (u && w && Wh(h)) {
          for (h = 0, w = s.responseEnd, o += 1; o < l.length; o++) {
            var U = l[o], W = U.startTime;
            if (W > w) break;
            var ue = U.transferSize, de = U.initiatorType;
            ue && Wh(de) && (U = U.responseEnd, h += ue * (U < w ? 1 : (w - W) / (U - W)));
          }
          if (--o, t += 8 * (u + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var _f = null, kf = null;
  function vs(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function $h(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function ey(e, t) {
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
  function Hf(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var jf = null;
  function mw() {
    var e = window.event;
    return e && e.type === "popstate" ? e === jf ? !1 : (jf = e, !0) : (jf = null, !1);
  }
  var ty = typeof setTimeout == "function" ? setTimeout : void 0, hw = typeof clearTimeout == "function" ? clearTimeout : void 0, ny = typeof Promise == "function" ? Promise : void 0, yw = typeof queueMicrotask == "function" ? queueMicrotask : typeof ny < "u" ? function(e) {
    return ny.resolve(null).then(e).catch(bw);
  } : ty;
  function bw(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function co(e) {
    return e === "head";
  }
  function ly(e, t) {
    var l = t, o = 0;
    do {
      var s = l.nextSibling;
      if (e.removeChild(l), s && s.nodeType === 8)
        if (l = s.data, l === "/$" || l === "/&") {
          if (o === 0) {
            e.removeChild(s), qr(t);
            return;
          }
          o--;
        } else if (l === "$" || l === "$?" || l === "$~" || l === "$!" || l === "&")
          o++;
        else if (l === "html")
          Ia(e.ownerDocument.documentElement);
        else if (l === "head") {
          l = e.ownerDocument.head, Ia(l);
          for (var u = l.firstChild; u; ) {
            var h = u.nextSibling, w = u.nodeName;
            u[oa] || w === "SCRIPT" || w === "STYLE" || w === "LINK" && u.rel.toLowerCase() === "stylesheet" || l.removeChild(u), u = h;
          }
        } else
          l === "body" && Ia(e.ownerDocument.body);
      l = s;
    } while (l);
    qr(t);
  }
  function oy(e, t) {
    var l = e;
    e = 0;
    do {
      var o = l.nextSibling;
      if (l.nodeType === 1 ? t ? (l._stashedDisplay = l.style.display, l.style.display = "none") : (l.style.display = l._stashedDisplay || "", l.getAttribute("style") === "" && l.removeAttribute("style")) : l.nodeType === 3 && (t ? (l._stashedText = l.nodeValue, l.nodeValue = "") : l.nodeValue = l._stashedText || ""), o && o.nodeType === 8)
        if (l = o.data, l === "/$") {
          if (e === 0) break;
          e--;
        } else
          l !== "$" && l !== "$?" && l !== "$~" && l !== "$!" || e++;
      l = o;
    } while (l);
  }
  function Uf(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Uf(l), Vu(l);
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
  function vw(e, t, l, o) {
    for (; e.nodeType === 1; ) {
      var s = l;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!o && (e.nodeName !== "INPUT" || e.type !== "hidden"))
          break;
      } else if (o) {
        if (!e[oa])
          switch (t) {
            case "meta":
              if (!e.hasAttribute("itemprop")) break;
              return e;
            case "link":
              if (u = e.getAttribute("rel"), u === "stylesheet" && e.hasAttribute("data-precedence"))
                break;
              if (u !== s.rel || e.getAttribute("href") !== (s.href == null || s.href === "" ? null : s.href) || e.getAttribute("crossorigin") !== (s.crossOrigin == null ? null : s.crossOrigin) || e.getAttribute("title") !== (s.title == null ? null : s.title))
                break;
              return e;
            case "style":
              if (e.hasAttribute("data-precedence")) break;
              return e;
            case "script":
              if (u = e.getAttribute("src"), (u !== (s.src == null ? null : s.src) || e.getAttribute("type") !== (s.type == null ? null : s.type) || e.getAttribute("crossorigin") !== (s.crossOrigin == null ? null : s.crossOrigin)) && u && e.hasAttribute("async") && !e.hasAttribute("itemprop"))
                break;
              return e;
            default:
              return e;
          }
      } else if (t === "input" && e.type === "hidden") {
        var u = s.name == null ? null : "" + s.name;
        if (s.type === "hidden" && e.getAttribute("name") === u)
          return e;
      } else return e;
      if (e = Zn(e.nextSibling), e === null) break;
    }
    return null;
  }
  function xw(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Zn(e.nextSibling), e === null)) return null;
    return e;
  }
  function ry(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Zn(e.nextSibling), e === null)) return null;
    return e;
  }
  function Lf(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function Bf(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function Sw(e, t) {
    var l = e.ownerDocument;
    if (e.data === "$~") e._reactRetry = t;
    else if (e.data !== "$?" || l.readyState !== "loading")
      t();
    else {
      var o = function() {
        t(), l.removeEventListener("DOMContentLoaded", o);
      };
      l.addEventListener("DOMContentLoaded", o), e._reactRetry = o;
    }
  }
  function Zn(e) {
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
  var If = null;
  function ay(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var l = e.data;
        if (l === "/$" || l === "/&") {
          if (t === 0)
            return Zn(e.nextSibling);
          t--;
        } else
          l !== "$" && l !== "$!" && l !== "$?" && l !== "$~" && l !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function iy(e) {
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
  function sy(e, t, l) {
    switch (t = vs(l), e) {
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
  function Ia(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    Vu(e);
  }
  var Fn = /* @__PURE__ */ new Map(), uy = /* @__PURE__ */ new Set();
  function xs(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var _l = Y.d;
  Y.d = {
    f: ww,
    r: Ew,
    D: Rw,
    C: Tw,
    L: Cw,
    m: Ow,
    X: Aw,
    S: Mw,
    M: zw
  };
  function ww() {
    var e = _l.f(), t = fs();
    return e || t;
  }
  function Ew(e) {
    var t = ur(e);
    t !== null && t.tag === 5 && t.type === "form" ? Cm(t) : _l.r(e);
  }
  var Vr = typeof document > "u" ? null : document;
  function cy(e, t, l) {
    var o = Vr;
    if (o && typeof t == "string" && t) {
      var s = Yn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), uy.has(s) || (uy.add(s), e = { rel: e, crossOrigin: l, href: t }, o.querySelector(s) === null && (t = o.createElement("link"), fn(t, "link", e), tn(t), o.head.appendChild(t)));
    }
  }
  function Rw(e) {
    _l.D(e), cy("dns-prefetch", e, null);
  }
  function Tw(e, t) {
    _l.C(e, t), cy("preconnect", e, t);
  }
  function Cw(e, t, l) {
    _l.L(e, t, l);
    var o = Vr;
    if (o && e && t) {
      var s = 'link[rel="preload"][as="' + Yn(t) + '"]';
      t === "image" && l && l.imageSrcSet ? (s += '[imagesrcset="' + Yn(
        l.imageSrcSet
      ) + '"]', typeof l.imageSizes == "string" && (s += '[imagesizes="' + Yn(
        l.imageSizes
      ) + '"]')) : s += '[href="' + Yn(e) + '"]';
      var u = s;
      switch (t) {
        case "style":
          u = Yr(e);
          break;
        case "script":
          u = Gr(e);
      }
      Fn.has(u) || (e = v(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), Fn.set(u, e), o.querySelector(s) !== null || t === "style" && o.querySelector(Va(u)) || t === "script" && o.querySelector(Ya(u)) || (t = o.createElement("link"), fn(t, "link", e), tn(t), o.head.appendChild(t)));
    }
  }
  function Ow(e, t) {
    _l.m(e, t);
    var l = Vr;
    if (l && e) {
      var o = t && typeof t.as == "string" ? t.as : "script", s = 'link[rel="modulepreload"][as="' + Yn(o) + '"][href="' + Yn(e) + '"]', u = s;
      switch (o) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          u = Gr(e);
      }
      if (!Fn.has(u) && (e = v({ rel: "modulepreload", href: e }, t), Fn.set(u, e), l.querySelector(s) === null)) {
        switch (o) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Ya(u)))
              return;
        }
        o = l.createElement("link"), fn(o, "link", e), tn(o), l.head.appendChild(o);
      }
    }
  }
  function Mw(e, t, l) {
    _l.S(e, t, l);
    var o = Vr;
    if (o && e) {
      var s = cr(o).hoistableStyles, u = Yr(e);
      t = t || "default";
      var h = s.get(u);
      if (!h) {
        var w = { loading: 0, preload: null };
        if (h = o.querySelector(
          Va(u)
        ))
          w.loading = 5;
        else {
          e = v(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = Fn.get(u)) && Vf(e, l);
          var U = h = o.createElement("link");
          tn(U), fn(U, "link", e), U._p = new Promise(function(W, ue) {
            U.onload = W, U.onerror = ue;
          }), U.addEventListener("load", function() {
            w.loading |= 1;
          }), U.addEventListener("error", function() {
            w.loading |= 2;
          }), w.loading |= 4, Ss(h, t, o);
        }
        h = {
          type: "stylesheet",
          instance: h,
          count: 1,
          state: w
        }, s.set(u, h);
      }
    }
  }
  function Aw(e, t) {
    _l.X(e, t);
    var l = Vr;
    if (l && e) {
      var o = cr(l).hoistableScripts, s = Gr(e), u = o.get(s);
      u || (u = l.querySelector(Ya(s)), u || (e = v({ src: e, async: !0 }, t), (t = Fn.get(s)) && Yf(e, t), u = l.createElement("script"), tn(u), fn(u, "link", e), l.head.appendChild(u)), u = {
        type: "script",
        instance: u,
        count: 1,
        state: null
      }, o.set(s, u));
    }
  }
  function zw(e, t) {
    _l.M(e, t);
    var l = Vr;
    if (l && e) {
      var o = cr(l).hoistableScripts, s = Gr(e), u = o.get(s);
      u || (u = l.querySelector(Ya(s)), u || (e = v({ src: e, async: !0, type: "module" }, t), (t = Fn.get(s)) && Yf(e, t), u = l.createElement("script"), tn(u), fn(u, "link", e), l.head.appendChild(u)), u = {
        type: "script",
        instance: u,
        count: 1,
        state: null
      }, o.set(s, u));
    }
  }
  function fy(e, t, l, o) {
    var s = (s = ae.current) ? xs(s) : null;
    if (!s) throw Error(i(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof l.precedence == "string" && typeof l.href == "string" ? (t = Yr(l.href), l = cr(
          s
        ).hoistableStyles, o = l.get(t), o || (o = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, o)), o) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (l.rel === "stylesheet" && typeof l.href == "string" && typeof l.precedence == "string") {
          e = Yr(l.href);
          var u = cr(
            s
          ).hoistableStyles, h = u.get(e);
          if (h || (s = s.ownerDocument || s, h = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, u.set(e, h), (u = s.querySelector(
            Va(e)
          )) && !u._p && (h.instance = u, h.state.loading = 5), Fn.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, Fn.set(e, l), u || Dw(
            s,
            e,
            l,
            h.state
          ))), t && o === null)
            throw Error(i(528, ""));
          return h;
        }
        if (t && o !== null)
          throw Error(i(529, ""));
        return null;
      case "script":
        return t = l.async, l = l.src, typeof l == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Gr(l), l = cr(
          s
        ).hoistableScripts, o = l.get(t), o || (o = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, l.set(t, o)), o) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(i(444, e));
    }
  }
  function Yr(e) {
    return 'href="' + Yn(e) + '"';
  }
  function Va(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function dy(e) {
    return v({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function Dw(e, t, l, o) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? o.loading = 1 : (t = e.createElement("link"), o.preload = t, t.addEventListener("load", function() {
      return o.loading |= 1;
    }), t.addEventListener("error", function() {
      return o.loading |= 2;
    }), fn(t, "link", l), tn(t), e.head.appendChild(t));
  }
  function Gr(e) {
    return '[src="' + Yn(e) + '"]';
  }
  function Ya(e) {
    return "script[async]" + e;
  }
  function py(e, t, l) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var o = e.querySelector(
            'style[data-href~="' + Yn(l.href) + '"]'
          );
          if (o)
            return t.instance = o, tn(o), o;
          var s = v({}, l, {
            "data-href": l.href,
            "data-precedence": l.precedence,
            href: null,
            precedence: null
          });
          return o = (e.ownerDocument || e).createElement(
            "style"
          ), tn(o), fn(o, "style", s), Ss(o, l.precedence, e), t.instance = o;
        case "stylesheet":
          s = Yr(l.href);
          var u = e.querySelector(
            Va(s)
          );
          if (u)
            return t.state.loading |= 4, t.instance = u, tn(u), u;
          o = dy(l), (s = Fn.get(s)) && Vf(o, s), u = (e.ownerDocument || e).createElement("link"), tn(u);
          var h = u;
          return h._p = new Promise(function(w, U) {
            h.onload = w, h.onerror = U;
          }), fn(u, "link", o), t.state.loading |= 4, Ss(u, l.precedence, e), t.instance = u;
        case "script":
          return u = Gr(l.src), (s = e.querySelector(
            Ya(u)
          )) ? (t.instance = s, tn(s), s) : (o = l, (s = Fn.get(u)) && (o = v({}, l), Yf(o, s)), e = e.ownerDocument || e, s = e.createElement("script"), tn(s), fn(s, "link", o), e.head.appendChild(s), t.instance = s);
        case "void":
          return null;
        default:
          throw Error(i(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (o = t.instance, t.state.loading |= 4, Ss(o, l.precedence, e));
    return t.instance;
  }
  function Ss(e, t, l) {
    for (var o = l.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), s = o.length ? o[o.length - 1] : null, u = s, h = 0; h < o.length; h++) {
      var w = o[h];
      if (w.dataset.precedence === t) u = w;
      else if (u !== s) break;
    }
    u ? u.parentNode.insertBefore(e, u.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function Vf(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Yf(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var ws = null;
  function gy(e, t, l) {
    if (ws === null) {
      var o = /* @__PURE__ */ new Map(), s = ws = /* @__PURE__ */ new Map();
      s.set(l, o);
    } else
      s = ws, o = s.get(l), o || (o = /* @__PURE__ */ new Map(), s.set(l, o));
    if (o.has(e)) return o;
    for (o.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var u = l[s];
      if (!(u[oa] || u[Rt] || e === "link" && u.getAttribute("rel") === "stylesheet") && u.namespaceURI !== "http://www.w3.org/2000/svg") {
        var h = u.getAttribute(t) || "";
        h = e + h;
        var w = o.get(h);
        w ? w.push(u) : o.set(h, [u]);
      }
    }
    return o;
  }
  function my(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function Nw(e, t, l) {
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
  function hy(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function _w(e, t, l, o) {
    if (l.type === "stylesheet" && (typeof o.media != "string" || matchMedia(o.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Yr(o.href), u = t.querySelector(
          Va(s)
        );
        if (u) {
          t = u._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Es.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = u, tn(u);
          return;
        }
        u = t.ownerDocument || t, o = dy(o), (s = Fn.get(s)) && Vf(o, s), u = u.createElement("link"), tn(u);
        var h = u;
        h._p = new Promise(function(w, U) {
          h.onload = w, h.onerror = U;
        }), fn(u, "link", o), l.instance = u;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = Es.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var Gf = 0;
  function kw(e, t) {
    return e.stylesheets && e.count === 0 && Ts(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var o = setTimeout(function() {
        if (e.stylesheets && Ts(e, e.stylesheets), e.unsuspend) {
          var u = e.unsuspend;
          e.unsuspend = null, u();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Gf === 0 && (Gf = 62500 * gw());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Ts(e, e.stylesheets), e.unsuspend)) {
            var u = e.unsuspend;
            e.unsuspend = null, u();
          }
        },
        (e.imgBytes > Gf ? 50 : 800) + t
      );
      return e.unsuspend = l, function() {
        e.unsuspend = null, clearTimeout(o), clearTimeout(s);
      };
    } : null;
  }
  function Es() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Ts(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var Rs = null;
  function Ts(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, Rs = /* @__PURE__ */ new Map(), t.forEach(Hw, e), Rs = null, Es.call(e));
  }
  function Hw(e, t) {
    if (!(t.state.loading & 4)) {
      var l = Rs.get(e);
      if (l) var o = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), Rs.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), u = 0; u < s.length; u++) {
          var h = s[u];
          (h.nodeName === "LINK" || h.getAttribute("media") !== "not all") && (l.set(h.dataset.precedence, h), o = h);
        }
        o && l.set(null, o);
      }
      s = t.instance, h = s.getAttribute("data-precedence"), u = l.get(h) || o, u === o && l.set(null, s), l.set(h, s), this.count++, o = Es.bind(this), s.addEventListener("load", o), s.addEventListener("error", o), u ? u.parentNode.insertBefore(s, u.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Ga = {
    $$typeof: z,
    Provider: null,
    Consumer: null,
    _currentValue: I,
    _currentValue2: I,
    _threadCount: 0
  };
  function jw(e, t, l, o, s, u, h, w, U) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Bn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Bn(0), this.hiddenUpdates = Bn(null), this.identifierPrefix = o, this.onUncaughtError = s, this.onCaughtError = u, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = U, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function yy(e, t, l, o, s, u, h, w, U, W, ue, de) {
    return e = new jw(
      e,
      t,
      l,
      h,
      U,
      W,
      ue,
      de,
      w
    ), t = 1, u === !0 && (t |= 24), u = Dn(3, null, null, t), e.current = u, u.stateNode = e, t = Sc(), t.refCount++, e.pooledCache = t, t.refCount++, u.memoizedState = {
      element: o,
      isDehydrated: l,
      cache: t
    }, Tc(u), e;
  }
  function by(e) {
    return e ? (e = xr, e) : xr;
  }
  function vy(e, t, l, o, s, u) {
    s = by(s), o.context === null ? o.context = s : o.pendingContext = s, o = $l(t), o.payload = { element: l }, u = u === void 0 ? null : u, u !== null && (o.callback = u), l = eo(e, o, t), l !== null && (Rn(l, e, t), Sa(l, e, t));
  }
  function xy(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function qf(e, t) {
    xy(e, t), (e = e.alternate) && xy(e, t);
  }
  function Sy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = _o(e, 67108864);
      t !== null && Rn(t, e, 67108864), qf(e, 67108864);
    }
  }
  function wy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = jn();
      t = Pe(t);
      var l = _o(e, t);
      l !== null && Rn(l, e, t), qf(e, t);
    }
  }
  var Cs = !0;
  function Uw(e, t, l, o) {
    var s = N.T;
    N.T = null;
    var u = Y.p;
    try {
      Y.p = 2, Pf(e, t, l, o);
    } finally {
      Y.p = u, N.T = s;
    }
  }
  function Lw(e, t, l, o) {
    var s = N.T;
    N.T = null;
    var u = Y.p;
    try {
      Y.p = 8, Pf(e, t, l, o);
    } finally {
      Y.p = u, N.T = s;
    }
  }
  function Pf(e, t, l, o) {
    if (Cs) {
      var s = Xf(o);
      if (s === null)
        Df(
          e,
          t,
          o,
          Os,
          l
        ), Ry(e, o);
      else if (Iw(
        s,
        e,
        t,
        l,
        o
      ))
        o.stopPropagation();
      else if (Ry(e, o), t & 4 && -1 < Bw.indexOf(e)) {
        for (; s !== null; ) {
          var u = ur(s);
          if (u !== null)
            switch (u.tag) {
              case 3:
                if (u = u.stateNode, u.current.memoizedState.isDehydrated) {
                  var h = Ht(u.pendingLanes);
                  if (h !== 0) {
                    var w = u;
                    for (w.pendingLanes |= 2, w.entangledLanes |= 2; h; ) {
                      var U = 1 << 31 - mt(h);
                      w.entanglements[1] |= U, h &= ~U;
                    }
                    il(u), (dt & 6) === 0 && (us = oe() + 500, Ua(0));
                  }
                }
                break;
              case 31:
              case 13:
                w = _o(u, 2), w !== null && Rn(w, u, 2), fs(), qf(u, 2);
            }
          if (u = Xf(o), u === null && Df(
            e,
            t,
            o,
            Os,
            l
          ), u === s) break;
          s = u;
        }
        s !== null && o.stopPropagation();
      } else
        Df(
          e,
          t,
          o,
          null,
          l
        );
    }
  }
  function Xf(e) {
    return e = Ku(e), Kf(e);
  }
  var Os = null;
  function Kf(e) {
    if (Os = null, e = sr(e), e !== null) {
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
    return Os = e, null;
  }
  function Ey(e) {
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
          case be:
            return 8;
          case ve:
          case We:
            return 32;
          case lt:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Qf = !1, fo = null, po = null, go = null, qa = /* @__PURE__ */ new Map(), Pa = /* @__PURE__ */ new Map(), mo = [], Bw = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function Ry(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        fo = null;
        break;
      case "dragenter":
      case "dragleave":
        po = null;
        break;
      case "mouseover":
      case "mouseout":
        go = null;
        break;
      case "pointerover":
      case "pointerout":
        qa.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Pa.delete(t.pointerId);
    }
  }
  function Xa(e, t, l, o, s, u) {
    return e === null || e.nativeEvent !== u ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: o,
      nativeEvent: u,
      targetContainers: [s]
    }, t !== null && (t = ur(t), t !== null && Sy(t)), e) : (e.eventSystemFlags |= o, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function Iw(e, t, l, o, s) {
    switch (t) {
      case "focusin":
        return fo = Xa(
          fo,
          e,
          t,
          l,
          o,
          s
        ), !0;
      case "dragenter":
        return po = Xa(
          po,
          e,
          t,
          l,
          o,
          s
        ), !0;
      case "mouseover":
        return go = Xa(
          go,
          e,
          t,
          l,
          o,
          s
        ), !0;
      case "pointerover":
        var u = s.pointerId;
        return qa.set(
          u,
          Xa(
            qa.get(u) || null,
            e,
            t,
            l,
            o,
            s
          )
        ), !0;
      case "gotpointercapture":
        return u = s.pointerId, Pa.set(
          u,
          Xa(
            Pa.get(u) || null,
            e,
            t,
            l,
            o,
            s
          )
        ), !0;
    }
    return !1;
  }
  function Ty(e) {
    var t = sr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, en(e.priority, function() {
              wy(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = g(l), t !== null) {
            e.blockedOn = t, en(e.priority, function() {
              wy(l);
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
  function Ms(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = Xf(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var o = new l.constructor(
          l.type,
          l
        );
        Xu = o, l.target.dispatchEvent(o), Xu = null;
      } else
        return t = ur(l), t !== null && Sy(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function Cy(e, t, l) {
    Ms(e) && l.delete(t);
  }
  function Vw() {
    Qf = !1, fo !== null && Ms(fo) && (fo = null), po !== null && Ms(po) && (po = null), go !== null && Ms(go) && (go = null), qa.forEach(Cy), Pa.forEach(Cy);
  }
  function As(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Qf || (Qf = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      Vw
    )));
  }
  var zs = null;
  function Oy(e) {
    zs !== e && (zs = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        zs === e && (zs = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], o = e[t + 1], s = e[t + 2];
          if (typeof o != "function") {
            if (Kf(o || l) === null)
              continue;
            break;
          }
          var u = ur(l);
          u !== null && (e.splice(t, 3), t -= 3, Pc(
            u,
            {
              pending: !0,
              data: s,
              method: l.method,
              action: o
            },
            o,
            s
          ));
        }
      }
    ));
  }
  function qr(e) {
    function t(U) {
      return As(U, e);
    }
    fo !== null && As(fo, e), po !== null && As(po, e), go !== null && As(go, e), qa.forEach(t), Pa.forEach(t);
    for (var l = 0; l < mo.length; l++) {
      var o = mo[l];
      o.blockedOn === e && (o.blockedOn = null);
    }
    for (; 0 < mo.length && (l = mo[0], l.blockedOn === null); )
      Ty(l), l.blockedOn === null && mo.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (o = 0; o < l.length; o += 3) {
        var s = l[o], u = l[o + 1], h = s[an] || null;
        if (typeof u == "function")
          h || Oy(l);
        else if (h) {
          var w = null;
          if (u && u.hasAttribute("formAction")) {
            if (s = u, h = u[an] || null)
              w = h.formAction;
            else if (Kf(s) !== null) continue;
          } else w = h.action;
          typeof w == "function" ? l[o + 1] = w : (l.splice(o, 3), o -= 3), Oy(l);
        }
      }
  }
  function My() {
    function e(u) {
      u.canIntercept && u.info === "react-transition" && u.intercept({
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
      s !== null && (s(), s = null), o || setTimeout(l, 20);
    }
    function l() {
      if (!o && !navigation.transition) {
        var u = navigation.currentEntry;
        u && u.url != null && navigation.navigate(u.url, {
          state: u.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var o = !1, s = null;
      return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(l, 100), function() {
        o = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), s !== null && (s(), s = null);
      };
    }
  }
  function Zf(e) {
    this._internalRoot = e;
  }
  Ds.prototype.render = Zf.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, o = jn();
    vy(l, o, e, t, null, null);
  }, Ds.prototype.unmount = Zf.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      vy(e.current, 2, null, e, null, null), fs(), t[ll] = null;
    }
  };
  function Ds(e) {
    this._internalRoot = e;
  }
  Ds.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = qt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < mo.length && t !== 0 && t < mo[l].priority; l++) ;
      mo.splice(l, 0, e), l === 0 && Ty(e);
    }
  };
  var Ay = r.version;
  if (Ay !== "19.2.7")
    throw Error(
      i(
        527,
        Ay,
        "19.2.7"
      )
    );
  Y.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? b(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var Yw = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: N,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Ns = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Ns.isDisabled && Ns.supportsFiber)
      try {
        $e = Ns.inject(
          Yw
        ), gt = Ns;
      } catch {
      }
  }
  return Qa.createRoot = function(e, t) {
    if (!c(e)) throw Error(i(299));
    var l = !1, o = "", s = jm, u = Um, h = Lm;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (o = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (u = t.onCaughtError), t.onRecoverableError !== void 0 && (h = t.onRecoverableError)), t = yy(
      e,
      1,
      !1,
      null,
      null,
      l,
      o,
      null,
      s,
      u,
      h,
      My
    ), e[ll] = t.current, zf(e), new Zf(t);
  }, Qa.hydrateRoot = function(e, t, l) {
    if (!c(e)) throw Error(i(299));
    var o = !1, s = "", u = jm, h = Um, w = Lm, U = null;
    return l != null && (l.unstable_strictMode === !0 && (o = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (u = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (w = l.onRecoverableError), l.formState !== void 0 && (U = l.formState)), t = yy(
      e,
      1,
      !0,
      t,
      l ?? null,
      o,
      s,
      U,
      u,
      h,
      w,
      My
    ), t.context = by(null), l = t.current, o = jn(), o = Pe(o), s = $l(o), s.callback = null, eo(l, s, o), l = o, t.current.lanes = l, Gt(t, l), il(t), e[ll] = t.current, zf(e), new Ds(t);
  }, Qa.version = "19.2.7", Qa;
}
var By;
function eE() {
  if (By) return Wf.exports;
  By = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (r) {
        console.error(r);
      }
  }
  return n(), Wf.exports = $w(), Wf.exports;
}
var tE = eE();
const Jb = (...n) => n.filter((r, a, i) => !!r && r.trim() !== "" && i.indexOf(r) === a).join(" ").trim();
const nE = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const lE = (n) => n.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (r, a, i) => i ? i.toUpperCase() : a.toLowerCase()
);
const Iy = (n) => {
  const r = lE(n);
  return r.charAt(0).toUpperCase() + r.slice(1);
};
var nd = {
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
const oE = (n) => {
  for (const r in n)
    if (r.startsWith("aria-") || r === "role" || r === "title")
      return !0;
  return !1;
}, rE = y.createContext({}), aE = () => y.useContext(rE), iE = y.forwardRef(
  ({ color: n, size: r, strokeWidth: a, absoluteStrokeWidth: i, className: c = "", children: f, iconNode: p, ...g }, m) => {
    const {
      size: d = 24,
      strokeWidth: b = 2,
      absoluteStrokeWidth: v = !1,
      color: x = "currentColor",
      className: T = ""
    } = aE() ?? {}, S = i ?? v ? Number(a ?? b) * 24 / Number(r ?? d) : a ?? b;
    return y.createElement(
      "svg",
      {
        ref: m,
        ...nd,
        width: r ?? d ?? nd.width,
        height: r ?? d ?? nd.height,
        stroke: n ?? x,
        strokeWidth: S,
        className: Jb("lucide", T, c),
        ...!f && !oE(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([C, R]) => y.createElement(C, R)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const Cn = (n, r) => {
  const a = y.forwardRef(
    ({ className: i, ...c }, f) => y.createElement(iE, {
      ref: f,
      iconNode: r,
      className: Jb(
        `lucide-${nE(Iy(n))}`,
        `lucide-${n}`,
        i
      ),
      ...c
    })
  );
  return a.displayName = Iy(n), a;
};
const sE = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], Wb = Cn("check", sE);
const uE = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], cE = Cn("chevron-down", uE);
const fE = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], dE = Cn("chevron-right", fE);
const pE = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], gE = Cn("ellipsis", pE);
const mE = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], hE = Cn("funnel", mE);
const yE = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], bE = Cn("layout-grid", yE);
const vE = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], xE = Cn("loader-circle", vE);
const SE = [
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
], wE = Cn("notebook-pen", SE);
const EE = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], RE = Cn("refresh-cw", EE);
const TE = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
], CE = Cn("rotate-ccw", TE);
const OE = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], ME = Cn("search", OE);
const AE = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], zE = Cn("settings", AE);
const DE = [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
], Vy = Cn("star", DE);
const NE = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], _E = Cn("x", NE);
function mu() {
  return typeof window < "u";
}
function pn(n) {
  return Bd(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function At(n) {
  var r;
  return (n == null || (r = n.ownerDocument) == null ? void 0 : r.defaultView) || window;
}
function Pl(n) {
  var r;
  return (r = (Bd(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : r.documentElement;
}
function Bd(n) {
  return mu() ? n instanceof Node || n instanceof At(n).Node : !1;
}
function Je(n) {
  return mu() ? n instanceof Element || n instanceof At(n).Element : !1;
}
function Ct(n) {
  return mu() ? n instanceof HTMLElement || n instanceof At(n).HTMLElement : !1;
}
function Fr(n) {
  return !mu() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof At(n).ShadowRoot;
}
function nr(n) {
  const {
    overflow: r,
    overflowX: a,
    overflowY: i,
    display: c
  } = Ln(n);
  return /auto|scroll|overlay|hidden|clip/.test(r + i + a) && c !== "inline" && c !== "contents";
}
function kE(n) {
  return /^(table|td|th)$/.test(pn(n));
}
function hu(n) {
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
const HE = /transform|translate|scale|rotate|perspective|filter/, jE = /paint|layout|strict|content/, Xo = (n) => !!n && n !== "none";
let ld;
function Id(n) {
  const r = Je(n) ? Ln(n) : n;
  return Xo(r.transform) || Xo(r.translate) || Xo(r.scale) || Xo(r.rotate) || Xo(r.perspective) || !Vd() && (Xo(r.backdropFilter) || Xo(r.filter)) || HE.test(r.willChange || "") || jE.test(r.contain || "");
}
function UE(n) {
  let r = Vl(n);
  for (; Ct(r) && !Ll(r); ) {
    if (Id(r))
      return r;
    if (hu(r))
      return null;
    r = Vl(r);
  }
  return null;
}
function Vd() {
  return ld == null && (ld = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), ld;
}
function Ll(n) {
  return /^(html|body|#document)$/.test(pn(n));
}
function Ln(n) {
  return At(n).getComputedStyle(n);
}
function yu(n) {
  return Je(n) ? {
    scrollLeft: n.scrollLeft,
    scrollTop: n.scrollTop
  } : {
    scrollLeft: n.scrollX,
    scrollTop: n.scrollY
  };
}
function Vl(n) {
  if (pn(n) === "html")
    return n;
  const r = (
    // Step into the shadow DOM of the parent of a slotted node.
    n.assignedSlot || // DOM Element detected.
    n.parentNode || // ShadowRoot detected.
    Fr(n) && n.host || // Fallback.
    Pl(n)
  );
  return Fr(r) ? r.host : r;
}
function $b(n) {
  const r = Vl(n);
  return Ll(r) ? (n.ownerDocument || n).body : Ct(r) && nr(r) ? r : $b(r);
}
function ci(n, r, a) {
  var i;
  r === void 0 && (r = []), a === void 0 && (a = !0);
  const c = $b(n), f = c === ((i = n.ownerDocument) == null ? void 0 : i.body), p = At(c);
  if (f) {
    const g = Sd(p);
    return r.concat(p, p.visualViewport || [], nr(c) ? c : [], g && a ? ci(g) : []);
  } else
    return r.concat(c, ci(c, [], a));
}
function Sd(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const Yd = {
  ...Zw
}, Yy = {};
function yn(n, r) {
  const a = y.useRef(Yy);
  return a.current === Yy && (a.current = n(r)), a;
}
const od = Yd.useInsertionEffect, LE = (
  // React 17 doesn't have useInsertionEffect.
  od && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  od !== Yd.useLayoutEffect ? od : (n) => n()
);
function De(n) {
  const r = yn(BE).current;
  return r.next = n, LE(r.effect), r.trampoline;
}
function BE() {
  const n = {
    next: void 0,
    callback: IE,
    trampoline: (...r) => n.callback?.(...r),
    effect: () => {
      n.callback = n.next;
    }
  };
  return n;
}
function IE() {
}
const VE = () => {
}, xe = typeof document < "u" ? y.useLayoutEffect : VE;
function wd(n, r) {
  if (n && !r)
    return n;
  if (!n && r)
    return r;
  if (n || r)
    return {
      ...n,
      ...r
    };
}
const Gd = {};
function Tn(n, r, a, i, c) {
  if (!a && !i && !c && !n)
    return eu(r);
  let f = eu(n);
  return r && (f = ei(f, r)), a && (f = ei(f, a)), i && (f = ei(f, i)), c && (f = ei(f, c)), f;
}
function YE(n) {
  if (n.length === 0)
    return Gd;
  if (n.length === 1)
    return eu(n[0]);
  let r = eu(n[0]);
  for (let a = 1; a < n.length; a += 1)
    r = ei(r, n[a]);
  return r;
}
function eu(n) {
  return qd(n) ? {
    ...tv(n, Gd)
  } : GE(n);
}
function ei(n, r) {
  return qd(r) ? tv(r, n) : qE(n, r);
}
function GE(n) {
  const r = {
    ...n
  };
  for (const a in r) {
    const i = r[a];
    ev(a, i) && (r[a] = nv(i));
  }
  return r;
}
function qE(n, r) {
  if (!r)
    return n;
  for (const a in r) {
    const i = r[a];
    switch (a) {
      case "style": {
        n[a] = wd(n.style, i);
        break;
      }
      case "className": {
        n[a] = lv(n.className, i);
        break;
      }
      default:
        ev(a, i) ? n[a] = PE(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function ev(n, r) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), c = n.charCodeAt(2);
  return a === 111 && i === 110 && c >= 65 && c <= 90 && (typeof r == "function" || typeof r > "u");
}
function qd(n) {
  return typeof n == "function";
}
function tv(n, r) {
  return qd(n) ? n(r) : n ?? Gd;
}
function PE(n, r) {
  return r ? n ? (...a) => {
    const i = a[0];
    if (ov(i)) {
      const f = i;
      tu(f);
      const p = r(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const c = r(...a);
    return n?.(...a), c;
  } : nv(r) : n;
}
function nv(n) {
  return n && ((...r) => {
    const a = r[0];
    return ov(a) && tu(a), n(...r);
  });
}
function tu(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function lv(n, r) {
  return r ? n ? r + " " + n : r : n;
}
function ov(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function XE(n, r) {
  return function(i, ...c) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), c.forEach((p) => f.searchParams.append("args[]", p)), `${r} error #${i}; visit ${f} for the full message.`;
  };
}
const Lt = XE("https://base-ui.com/production-error", "Base UI"), rv = /* @__PURE__ */ y.createContext(void 0);
function Pd(n = !1) {
  const r = y.useContext(rv);
  if (r === void 0 && !n)
    throw new Error(Lt(16));
  return r;
}
function KE(n) {
  const {
    focusableWhenDisabled: r,
    disabled: a,
    composite: i = !1,
    tabIndex: c = 0,
    isNativeButton: f
  } = n, p = i && r !== !1, g = i && r === !1;
  return {
    props: y.useMemo(() => {
      const d = {
        // allow Tabbing away from focusableWhenDisabled elements
        onKeyDown(b) {
          a && r && b.key !== "Tab" && b.preventDefault();
        }
      };
      return i || (d.tabIndex = c, !f && a && (d.tabIndex = r ? c : -1)), (f && (r || p) || !f && a) && (d["aria-disabled"] = a), f && (!r || g) && (d.disabled = a), d;
    }, [i, a, r, p, g, f, c])
  };
}
function lr(n = {}) {
  const {
    disabled: r = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: c = !0,
    composite: f
  } = n, p = y.useRef(null), g = Pd(!0), m = f ?? g !== void 0, {
    props: d
  } = KE({
    focusableWhenDisabled: a,
    disabled: r,
    composite: m,
    tabIndex: i,
    isNativeButton: c
  }), b = y.useCallback(() => {
    const T = p.current;
    rd(T) && m && r && d.disabled === void 0 && T.disabled && (T.disabled = !1);
  }, [r, d.disabled, m]);
  xe(b, [b]);
  const v = y.useCallback((T = {}) => {
    const {
      onClick: S,
      onMouseDown: C,
      onKeyUp: R,
      onKeyDown: A,
      onPointerDown: O,
      ...z
    } = T;
    return Tn({
      onClick(M) {
        if (r) {
          M.preventDefault();
          return;
        }
        S?.(M);
      },
      onMouseDown(M) {
        r || C?.(M);
      },
      onKeyDown(M) {
        if (r || (tu(M), A?.(M), M.baseUIHandlerPrevented))
          return;
        const L = M.target === M.currentTarget, D = M.currentTarget, j = rd(D), _ = !c && QE(D), X = L && (c ? j : !_), q = M.key === "Enter", re = M.key === " ", Q = D.getAttribute("role"), J = Q?.startsWith("menuitem") || Q === "option" || Q === "gridcell";
        if (L && m && re) {
          if (M.defaultPrevented && J)
            return;
          M.preventDefault(), _ || c && j ? (D.click(), M.preventBaseUIHandler()) : X && (S?.(M), M.preventBaseUIHandler());
          return;
        }
        X && (!c && (re || q) && M.preventDefault(), !c && q && S?.(M));
      },
      onKeyUp(M) {
        if (!r) {
          if (tu(M), R?.(M), M.target === M.currentTarget && c && m && rd(M.currentTarget) && M.key === " ") {
            M.preventDefault();
            return;
          }
          M.baseUIHandlerPrevented || M.target === M.currentTarget && !c && !m && M.key === " " && S?.(M);
        }
      },
      onPointerDown(M) {
        if (r) {
          M.preventDefault();
          return;
        }
        O?.(M);
      }
    }, c ? {
      type: "button"
    } : {
      role: "button"
    }, d, z);
  }, [r, d, m, c]), x = De((T) => {
    p.current = T, b();
  });
  return {
    getButtonProps: v,
    buttonRef: x
  };
}
function rd(n) {
  return Ct(n) && n.tagName === "BUTTON";
}
function QE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function xo(n, r, a, i) {
  const c = yn(av).current;
  return FE(c, n, r, a, i) && iv(c, [n, r, a, i]), c.callback;
}
function ZE(n) {
  const r = yn(av).current;
  return JE(r, n) && iv(r, n), r.callback;
}
function av() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function FE(n, r, a, i, c) {
  return n.refs[0] !== r || n.refs[1] !== a || n.refs[2] !== i || n.refs[3] !== c;
}
function JE(n, r) {
  return n.refs.length !== r.length || n.refs.some((a, i) => a !== r[i]);
}
function iv(n, r) {
  if (n.refs = r, r.every((a) => a == null)) {
    n.callback = null;
    return;
  }
  n.callback = (a) => {
    if (n.cleanup && (n.cleanup(), n.cleanup = null), a != null) {
      const i = Array(r.length).fill(null);
      for (let c = 0; c < r.length; c += 1) {
        const f = r[c];
        if (f != null)
          switch (typeof f) {
            case "function": {
              const p = f(a);
              typeof p == "function" && (i[c] = p);
              break;
            }
            case "object": {
              f.current = a;
              break;
            }
          }
      }
      n.cleanup = () => {
        for (let c = 0; c < r.length; c += 1) {
          const f = r[c];
          if (f != null)
            switch (typeof f) {
              case "function": {
                const p = i[c];
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
const WE = parseInt(y.version, 10);
function Xd(n) {
  return WE >= n;
}
function Gy(n) {
  if (!/* @__PURE__ */ y.isValidElement(n))
    return null;
  const r = n, a = r.props;
  return (Xd(19) ? a?.ref : r.ref) ?? null;
}
function ln() {
}
const Yl = Object.freeze([]), Ot = Object.freeze({});
function $E(n, r) {
  const a = {};
  for (const i in n) {
    const c = n[i];
    if (r?.hasOwnProperty(i)) {
      const f = r[i](c);
      f != null && Object.assign(a, f);
      continue;
    }
    c === !0 ? a[`data-${i.toLowerCase()}`] = "" : c && (a[`data-${i.toLowerCase()}`] = c.toString());
  }
  return a;
}
function e1(n, r) {
  return typeof n == "function" ? n(r) : n;
}
function t1(n, r) {
  return typeof n == "function" ? n(r) : n;
}
function it(n, r, a = {}) {
  const i = r.render, c = n1(r, a);
  if (a.enabled === !1)
    return null;
  const f = a.state ?? Ot;
  return r1(n, i, c, f);
}
function n1(n, r = {}) {
  const {
    className: a,
    style: i,
    render: c
  } = n, {
    state: f = Ot,
    ref: p,
    props: g,
    stateAttributesMapping: m,
    enabled: d = !0
  } = r, b = d ? e1(a, f) : void 0, v = d ? t1(i, f) : void 0, x = d ? $E(f, m) : Ot, T = d && g ? l1(g) : void 0, S = d ? wd(x, T) ?? {} : Ot;
  return typeof document < "u" && (d ? Array.isArray(p) ? S.ref = ZE([S.ref, Gy(c), ...p]) : S.ref = xo(S.ref, Gy(c), p) : xo(null, null)), d ? (b !== void 0 && (S.className = lv(S.className, b)), v !== void 0 && (S.style = wd(S.style, v)), S) : Ot;
}
function l1(n) {
  return Array.isArray(n) ? YE(n) : Tn(void 0, n);
}
const o1 = /* @__PURE__ */ Symbol.for("react.lazy");
function r1(n, r, a, i) {
  if (r) {
    if (typeof r == "function")
      return r(a, i);
    const c = Tn(a, r.props);
    c.ref = a.ref;
    let f = r;
    return f?.$$typeof === o1 && (f = y.Children.toArray(r)[0]), /* @__PURE__ */ y.cloneElement(f, c);
  }
  if (n && typeof n == "string")
    return a1(n, a);
  throw new Error(Lt(8));
}
function a1(n, r) {
  return n === "button" ? /* @__PURE__ */ y.createElement("button", {
    type: "button",
    ...r,
    key: r.key
  }) : n === "img" ? /* @__PURE__ */ y.createElement("img", {
    alt: "",
    ...r,
    key: r.key
  }) : /* @__PURE__ */ y.createElement(n, r);
}
const i1 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    disabled: f = !1,
    focusableWhenDisabled: p = !1,
    nativeButton: g = !0,
    style: m,
    ...d
  } = r, {
    getButtonProps: b,
    buttonRef: v
  } = lr({
    disabled: f,
    focusableWhenDisabled: p,
    native: g
  });
  return it("button", r, {
    state: {
      disabled: f
    },
    ref: [a, v],
    props: [d, b]
  });
});
function sv(n) {
  var r, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var c = n.length;
    for (r = 0; r < c; r++) n[r] && (a = sv(n[r])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function uv() {
  for (var n, r, a = 0, i = "", c = arguments.length; a < c; a++) (n = arguments[a]) && (r = sv(n)) && (i && (i += " "), i += r);
  return i;
}
const qy = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, Py = uv, Kd = (n, r) => (a) => {
  var i;
  if (r?.variants == null) return Py(n, a?.class, a?.className);
  const { variants: c, defaultVariants: f } = r, p = Object.keys(c).map((d) => {
    const b = a?.[d], v = f?.[d];
    if (b === null) return null;
    const x = qy(b) || qy(v);
    return c[d][x];
  }), g = a && Object.entries(a).reduce((d, b) => {
    let [v, x] = b;
    return x === void 0 || (d[v] = x), d;
  }, {}), m = r == null || (i = r.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, b) => {
    let { class: v, className: x, ...T } = b;
    return Object.entries(T).every((S) => {
      let [C, R] = S;
      return Array.isArray(R) ? R.includes({
        ...f,
        ...g
      }[C]) : {
        ...f,
        ...g
      }[C] === R;
    }) ? [
      ...d,
      v,
      x
    ] : d;
  }, []);
  return Py(n, p, m, a?.class, a?.className);
}, s1 = (n, r) => {
  const a = new Array(n.length + r.length);
  for (let i = 0; i < n.length; i++)
    a[i] = n[i];
  for (let i = 0; i < r.length; i++)
    a[n.length + i] = r[i];
  return a;
}, u1 = (n, r) => ({
  classGroupId: n,
  validator: r
}), cv = (n = /* @__PURE__ */ new Map(), r = null, a) => ({
  nextPart: n,
  validators: r,
  classGroupId: a
}), nu = "-", Xy = [], c1 = "arbitrary..", f1 = (n) => {
  const r = p1(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return d1(p);
      const g = p.split(nu), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return fv(g, m, r);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? s1(d, m) : m : d || Xy;
      }
      return a[p] || Xy;
    }
  };
}, fv = (n, r, a) => {
  if (n.length - r === 0)
    return a.classGroupId;
  const c = n[r], f = a.nextPart.get(c);
  if (f) {
    const d = fv(n, r + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const g = r === 0 ? n.join(nu) : n.slice(r).join(nu), m = p.length;
  for (let d = 0; d < m; d++) {
    const b = p[d];
    if (b.validator(g))
      return b.classGroupId;
  }
}, d1 = (n) => n.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
  const r = n.slice(1, -1), a = r.indexOf(":"), i = r.slice(0, a);
  return i ? c1 + i : void 0;
})(), p1 = (n) => {
  const {
    theme: r,
    classGroups: a
  } = n;
  return g1(a, r);
}, g1 = (n, r) => {
  const a = cv();
  for (const i in n) {
    const c = n[i];
    Qd(c, a, i, r);
  }
  return a;
}, Qd = (n, r, a, i) => {
  const c = n.length;
  for (let f = 0; f < c; f++) {
    const p = n[f];
    m1(p, r, a, i);
  }
}, m1 = (n, r, a, i) => {
  if (typeof n == "string") {
    h1(n, r, a);
    return;
  }
  if (typeof n == "function") {
    y1(n, r, a, i);
    return;
  }
  b1(n, r, a, i);
}, h1 = (n, r, a) => {
  const i = n === "" ? r : dv(r, n);
  i.classGroupId = a;
}, y1 = (n, r, a, i) => {
  if (v1(n)) {
    Qd(n(i), r, a, i);
    return;
  }
  r.validators === null && (r.validators = []), r.validators.push(u1(a, n));
}, b1 = (n, r, a, i) => {
  const c = Object.entries(n), f = c.length;
  for (let p = 0; p < f; p++) {
    const [g, m] = c[p];
    Qd(m, dv(r, g), a, i);
  }
}, dv = (n, r) => {
  let a = n;
  const i = r.split(nu), c = i.length;
  for (let f = 0; f < c; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = cv(), a.nextPart.set(p, g)), a = g;
  }
  return a;
}, v1 = (n) => "isThemeGetter" in n && n.isThemeGetter === !0, x1 = (n) => {
  if (n < 1)
    return {
      get: () => {
      },
      set: () => {
      }
    };
  let r = 0, a = /* @__PURE__ */ Object.create(null), i = /* @__PURE__ */ Object.create(null);
  const c = (f, p) => {
    a[f] = p, r++, r > n && (r = 0, i = a, a = /* @__PURE__ */ Object.create(null));
  };
  return {
    get(f) {
      let p = a[f];
      if (p !== void 0)
        return p;
      if ((p = i[f]) !== void 0)
        return c(f, p), p;
    },
    set(f, p) {
      f in a ? a[f] = p : c(f, p);
    }
  };
}, Ed = "!", Ky = ":", S1 = [], Qy = (n, r, a, i, c) => ({
  modifiers: n,
  hasImportantModifier: r,
  baseClassName: a,
  maybePostfixModifierPosition: i,
  isExternal: c
}), w1 = (n) => {
  const {
    prefix: r,
    experimentalParseClassName: a
  } = n;
  let i = (c) => {
    const f = [];
    let p = 0, g = 0, m = 0, d;
    const b = c.length;
    for (let C = 0; C < b; C++) {
      const R = c[C];
      if (p === 0 && g === 0) {
        if (R === Ky) {
          f.push(c.slice(m, C)), m = C + 1;
          continue;
        }
        if (R === "/") {
          d = C;
          continue;
        }
      }
      R === "[" ? p++ : R === "]" ? p-- : R === "(" ? g++ : R === ")" && g--;
    }
    const v = f.length === 0 ? c : c.slice(m);
    let x = v, T = !1;
    v.endsWith(Ed) ? (x = v.slice(0, -1), T = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      v.startsWith(Ed) && (x = v.slice(1), T = !0)
    );
    const S = d && d > m ? d - m : void 0;
    return Qy(f, T, x, S);
  };
  if (r) {
    const c = r + Ky, f = i;
    i = (p) => p.startsWith(c) ? f(p.slice(c.length)) : Qy(S1, !1, p, void 0, !0);
  }
  if (a) {
    const c = i;
    i = (f) => a({
      className: f,
      parseClassName: c
    });
  }
  return i;
}, E1 = (n) => {
  const r = /* @__PURE__ */ new Map();
  return n.orderSensitiveModifiers.forEach((a, i) => {
    r.set(a, 1e6 + i);
  }), (a) => {
    const i = [];
    let c = [];
    for (let f = 0; f < a.length; f++) {
      const p = a[f], g = p[0] === "[", m = r.has(p);
      g || m ? (c.length > 0 && (c.sort(), i.push(...c), c = []), i.push(p)) : c.push(p);
    }
    return c.length > 0 && (c.sort(), i.push(...c)), i;
  };
}, R1 = (n) => ({
  cache: x1(n.cacheSize),
  parseClassName: w1(n),
  sortModifiers: E1(n),
  postfixLookupClassGroupIds: T1(n),
  ...f1(n)
}), T1 = (n) => {
  const r = /* @__PURE__ */ Object.create(null), a = n.postfixLookupClassGroups;
  if (a)
    for (let i = 0; i < a.length; i++)
      r[a[i]] = !0;
  return r;
}, C1 = /\s+/, O1 = (n, r) => {
  const {
    parseClassName: a,
    getClassGroupId: i,
    getConflictingClassGroupIds: c,
    sortModifiers: f,
    postfixLookupClassGroupIds: p
  } = r, g = [], m = n.trim().split(C1);
  let d = "";
  for (let b = m.length - 1; b >= 0; b -= 1) {
    const v = m[b], {
      isExternal: x,
      modifiers: T,
      hasImportantModifier: S,
      baseClassName: C,
      maybePostfixModifierPosition: R
    } = a(v);
    if (x) {
      d = v + (d.length > 0 ? " " + d : d);
      continue;
    }
    let A = !!R, O;
    if (A) {
      const j = C.substring(0, R);
      O = i(j);
      const _ = O && p[O] ? i(C) : void 0;
      _ && _ !== O && (O = _, A = !1);
    } else
      O = i(C);
    if (!O) {
      if (!A) {
        d = v + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (O = i(C), !O) {
        d = v + (d.length > 0 ? " " + d : d);
        continue;
      }
      A = !1;
    }
    const z = T.length === 0 ? "" : T.length === 1 ? T[0] : f(T).join(":"), M = S ? z + Ed : z, L = M + O;
    if (g.indexOf(L) > -1)
      continue;
    g.push(L);
    const D = c(O, A);
    for (let j = 0; j < D.length; ++j) {
      const _ = D[j];
      g.push(M + _);
    }
    d = v + (d.length > 0 ? " " + d : d);
  }
  return d;
}, M1 = (...n) => {
  let r = 0, a, i, c = "";
  for (; r < n.length; )
    (a = n[r++]) && (i = pv(a)) && (c && (c += " "), c += i);
  return c;
}, pv = (n) => {
  if (typeof n == "string")
    return n;
  let r, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (r = pv(n[i])) && (a && (a += " "), a += r);
  return a;
}, A1 = (n, ...r) => {
  let a, i, c, f;
  const p = (m) => {
    const d = r.reduce((b, v) => v(b), n());
    return a = R1(d), i = a.cache.get, c = a.cache.set, f = g, g(m);
  }, g = (m) => {
    const d = i(m);
    if (d)
      return d;
    const b = O1(m, a);
    return c(m, b), b;
  };
  return f = p, (...m) => f(M1(...m));
}, z1 = [], $t = (n) => {
  const r = (a) => a[n] || z1;
  return r.isThemeGetter = !0, r;
}, gv = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, mv = /^\((?:(\w[\w-]*):)?(.+)\)$/i, D1 = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, N1 = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, _1 = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, k1 = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, H1 = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, j1 = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, yo = (n) => D1.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), sl = (n) => !!n && Number.isInteger(Number(n)), ad = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), kl = (n) => N1.test(n), hv = () => !0, U1 = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  _1.test(n) && !k1.test(n)
), Zd = () => !1, L1 = (n) => H1.test(n), B1 = (n) => j1.test(n), I1 = (n) => !Me(n) && !Ae(n), V1 = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), Y1 = (n) => wo(n, vv, Zd), Me = (n) => gv.test(n), Ko = (n) => wo(n, xv, U1), Zy = (n) => wo(n, F1, Ze), G1 = (n) => wo(n, wv, hv), q1 = (n) => wo(n, Sv, Zd), Fy = (n) => wo(n, yv, Zd), P1 = (n) => wo(n, bv, B1), _s = (n) => wo(n, Ev, L1), Ae = (n) => mv.test(n), Za = (n) => or(n, xv), X1 = (n) => or(n, Sv), Jy = (n) => or(n, yv), K1 = (n) => or(n, vv), Q1 = (n) => or(n, bv), ks = (n) => or(n, Ev, !0), Z1 = (n) => or(n, wv, !0), wo = (n, r, a) => {
  const i = gv.exec(n);
  return i ? i[1] ? r(i[1]) : a(i[2]) : !1;
}, or = (n, r, a = !1) => {
  const i = mv.exec(n);
  return i ? i[1] ? r(i[1]) : a : !1;
}, yv = (n) => n === "position" || n === "percentage", bv = (n) => n === "image" || n === "url", vv = (n) => n === "length" || n === "size" || n === "bg-size", xv = (n) => n === "length", F1 = (n) => n === "number", Sv = (n) => n === "family-name", wv = (n) => n === "number" || n === "weight", Ev = (n) => n === "shadow", J1 = () => {
  const n = $t("color"), r = $t("font"), a = $t("text"), i = $t("font-weight"), c = $t("tracking"), f = $t("leading"), p = $t("breakpoint"), g = $t("container"), m = $t("spacing"), d = $t("radius"), b = $t("shadow"), v = $t("inset-shadow"), x = $t("text-shadow"), T = $t("drop-shadow"), S = $t("blur"), C = $t("perspective"), R = $t("aspect"), A = $t("ease"), O = $t("animate"), z = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], M = () => [
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
  ], L = () => [...M(), Ae, Me], D = () => ["auto", "hidden", "clip", "visible", "scroll"], j = () => ["auto", "contain", "none"], _ = () => [Ae, Me, m], X = () => [yo, "full", "auto", ..._()], q = () => [sl, "none", "subgrid", Ae, Me], re = () => ["auto", {
    span: ["full", sl, Ae, Me]
  }, sl, Ae, Me], Q = () => [sl, "auto", Ae, Me], J = () => ["auto", "min", "max", "fr", Ae, Me], Z = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], G = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], N = () => ["auto", ..._()], Y = () => [yo, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ..._()], I = () => [yo, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ..._()], K = () => [yo, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ..._()], B = () => [n, Ae, Me], E = () => [...M(), Jy, Fy, {
    position: [Ae, Me]
  }], H = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], te = () => ["auto", "cover", "contain", K1, Y1, {
    size: [Ae, Me]
  }], ee = () => [ad, Za, Ko], ie = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ae = () => ["", Ze, Za, Ko], le = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, ad, Jy, Fy], _e = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    S,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], fe = () => ["none", Ze, Ae, Me], ye = () => [Ze, Ae, Me], Te = () => [yo, "full", ..._()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [kl],
      breakpoint: [kl],
      color: [hv],
      container: [kl],
      "drop-shadow": [kl],
      ease: ["in", "out", "in-out"],
      font: [I1],
      "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
      "inset-shadow": [kl],
      leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
      perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
      radius: [kl],
      shadow: [kl],
      spacing: ["px", Ze],
      text: [kl],
      "text-shadow": [kl],
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
        aspect: ["auto", "square", yo, Me, Ae, R]
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
      "container-named": [V1],
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
        overscroll: j()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": j()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": j()
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
        inset: X()
      }],
      /**
       * Inset Inline
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": X()
      }],
      /**
       * Inset Block
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": X()
      }],
      /**
       * Inset Inline Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-s` in next major release
       */
      start: [{
        "inset-s": X(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        start: X()
      }],
      /**
       * Inset Inline End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       * @todo class group will be renamed to `inset-e` in next major release
       */
      end: [{
        "inset-e": X(),
        /**
         * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
         * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
         */
        end: X()
      }],
      /**
       * Inset Block Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-bs": [{
        "inset-bs": X()
      }],
      /**
       * Inset Block End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-be": [{
        "inset-be": X()
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: X()
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: X()
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: X()
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: X()
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
        z: [sl, "auto", Ae, Me]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [yo, "full", "auto", g, ..._()]
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
        flex: [Ze, yo, "auto", "initial", "none", Me]
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
        order: [sl, "first", "last", "none", Ae, Me]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": q()
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: re()
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
        "grid-rows": q()
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: re()
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
        "auto-cols": J()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": J()
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
        "justify-items": [...G(), "normal"]
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      "justify-self": [{
        "justify-self": ["auto", ...G()]
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
        items: [...G(), {
          baseline: ["", "last"]
        }]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      "align-self": [{
        self: ["auto", ...G(), {
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
        "place-items": [...G(), "baseline"]
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      "place-self": [{
        "place-self": ["auto", ...G()]
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
        m: N()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: N()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: N()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: N()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: N()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: N()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: N()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: N()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: N()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: N()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: N()
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
        text: ["base", a, Za, Ko]
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
        font: [i, Z1, G1]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", ad, Me]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [X1, q1, r]
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
        tracking: [c, Ae, Me]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      "line-clamp": [{
        "line-clamp": [Ze, "none", Ae, Zy]
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
        decoration: [...le(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: [Ze, "from-font", "auto", Ae, Ko]
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
        tab: [sl, Ae, Me]
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
        bg: E()
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
        bg: te()
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          linear: [{
            to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
          }, sl, Ae, Me],
          radial: ["", Ae, Me],
          conic: [sl, Ae, Me]
        }, Q1, P1]
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
        from: ee()
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: ee()
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: ee()
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
        rounded: ie()
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": ie()
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": ie()
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": ie()
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": ie()
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": ie()
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": ie()
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": ie()
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": ie()
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": ie()
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": ie()
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": ie()
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": ie()
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": ie()
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": ie()
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w": [{
        border: ae()
      }],
      /**
       * Border Width Inline
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-x": [{
        "border-x": ae()
      }],
      /**
       * Border Width Block
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-y": [{
        "border-y": ae()
      }],
      /**
       * Border Width Inline Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-s": [{
        "border-s": ae()
      }],
      /**
       * Border Width Inline End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-e": [{
        "border-e": ae()
      }],
      /**
       * Border Width Block Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-bs": [{
        "border-bs": ae()
      }],
      /**
       * Border Width Block End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-be": [{
        "border-be": ae()
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-t": [{
        "border-t": ae()
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-r": [{
        "border-r": ae()
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-b": [{
        "border-b": ae()
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-l": [{
        "border-l": ae()
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/border-width#between-children
       */
      "divide-x": [{
        "divide-x": ae()
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
        "divide-y": ae()
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
        border: [...le(), "hidden", "none"]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
       */
      "divide-style": [{
        divide: [...le(), "hidden", "none"]
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
        outline: [...le(), "none", "hidden"]
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
        outline: ["", Ze, Za, Ko]
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
          b,
          ks,
          _s
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
        "inset-shadow": ["none", v, ks, _s]
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
        ring: ae()
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
        "ring-offset": [Ze, Ko]
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
        "inset-ring": ae()
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
        "text-shadow": ["none", x, ks, _s]
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
        "mask-radial-at": M()
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
        mask: E()
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
        mask: te()
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
        blur: _e()
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
          T,
          ks,
          _s
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
        "backdrop-blur": _e()
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
        perspective: [C, Ae, Me]
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
        translate: Te()
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": Te()
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": Te()
      }],
      /**
       * Translate Z
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-z": [{
        "translate-z": Te()
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
        zoom: [sl, Ae, Me]
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
        stroke: [Ze, Za, Ko, Zy]
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
}, W1 = /* @__PURE__ */ A1(J1);
function st(...n) {
  return W1(uv(n));
}
const $1 = Kd(
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
function Zo({
  className: n,
  variant: r = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ k.jsx(
    i1,
    {
      "data-slot": "button",
      className: st($1({ variant: r, size: a, className: n })),
      ...i
    }
  );
}
function Fd(n) {
  const r = y.useRef(!0);
  r.current && (r.current = !1, n());
}
function Fe(n, r, a, i) {
  return n.addEventListener(r, a, i), () => {
    n.removeEventListener(r, a, i);
  };
}
function eR() {
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
  userAgent: tR,
  platform: nR,
  maxTouchPoints: lR
} = eR(), bu = tR.toLowerCase(), fi = nR.toLowerCase(), vu = /^i(os$|p)/.test(fi) || fi === "macintel" && lR > 1, Wy = "android", Rd = fi === Wy || bu.includes(Wy), Jd = !vu && fi.startsWith("mac");
fi.startsWith("win");
const oR = Jd || vu, Eo = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!Eo && bu.includes("firefox");
!Eo && bu.includes("chrom");
const rR = oR, Wd = /jsdom|happydom/.test(bu);
function et(n) {
  return n?.ownerDocument || document;
}
const aR = [];
function $d(n) {
  y.useEffect(n, aR);
}
const Fa = 0;
class nl {
  static create() {
    return new nl();
  }
  currentId = Fa;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  start(r, a) {
    this.clear(), this.currentId = setTimeout(() => {
      this.currentId = Fa, a();
    }, r);
  }
  isStarted() {
    return this.currentId !== Fa;
  }
  clear = () => {
    this.currentId !== Fa && (clearTimeout(this.currentId), this.currentId = Fa);
  };
  disposeEffect = () => this.clear;
}
function rn() {
  const n = yn(nl.create).current;
  return $d(n.disposeEffect), n;
}
const Hs = null;
class iR {
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
  tick = (r) => {
    this.isScheduled = !1;
    const a = this.callbacks, i = this.callbacksCount;
    if (this.callbacks = [], this.callbacksCount = 0, this.startId = this.nextId, i > 0)
      for (let c = 0; c < a.length; c += 1)
        a[c]?.(r);
  };
  request(r) {
    const a = this.nextId;
    return this.nextId += 1, this.callbacks.push(r), this.callbacksCount += 1, !this.isScheduled && (requestAnimationFrame(this.tick), this.isScheduled = !0), a;
  }
  cancel(r) {
    const a = r - this.startId;
    a < 0 || a >= this.callbacks.length || (this.callbacks[a] = null, this.callbacksCount -= 1);
  }
}
const js = new iR();
class cl {
  static create() {
    return new cl();
  }
  static request(r) {
    return js.request(r);
  }
  static cancel(r) {
    return js.cancel(r);
  }
  currentId = Hs;
  /**
   * Executes `fn` after `delay`, clearing any previously scheduled call.
   */
  request(r) {
    this.cancel(), this.currentId = js.request(() => {
      this.currentId = Hs, r();
    });
  }
  cancel = () => {
    this.currentId !== Hs && (js.cancel(this.currentId), this.currentId = Hs);
  };
  disposeEffect = () => this.cancel;
}
function Jr() {
  const n = yn(cl.create).current;
  return $d(n.disposeEffect), n;
}
let $y = {}, eb = {}, tb = "";
function sR(n) {
  if (typeof document > "u")
    return !1;
  const r = et(n);
  return At(r).innerWidth - r.documentElement.clientWidth > 0;
}
function uR(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = et(n), i = a.documentElement, c = a.body, f = nr(i) ? i : c, p = f.style.overflowY, g = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const m = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = g, m === d;
}
function cR(n) {
  const r = et(n), a = r.documentElement, i = r.body, c = nr(a) ? a : i, f = {
    overflowY: c.style.overflowY,
    overflowX: c.style.overflowX
  };
  return Object.assign(c.style, {
    overflowY: "hidden",
    overflowX: "hidden"
  }), () => {
    Object.assign(c.style, f);
  };
}
function fR(n) {
  const r = et(n), a = r.documentElement, i = r.body, c = At(a);
  let f = 0, p = 0, g = !1;
  const m = cl.create();
  if (Eo && (c.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const T = c.getComputedStyle(a), S = c.getComputedStyle(i), A = (T.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, $y = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, tb = a.style.scrollBehavior, eb = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const O = a.scrollHeight > a.clientHeight, z = a.scrollWidth > a.clientWidth, M = T.overflowY === "scroll" || S.overflowY === "scroll", L = T.overflowX === "scroll" || S.overflowX === "scroll", D = Math.max(0, c.innerWidth - i.clientWidth), j = Math.max(0, c.innerHeight - i.clientHeight), _ = parseFloat(S.marginTop) + parseFloat(S.marginBottom), X = parseFloat(S.marginLeft) + parseFloat(S.marginRight), q = nr(a) ? a : i;
    if (g = uR(n), g) {
      a.style.scrollbarGutter = A, q.style.overflowY = "hidden", q.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: A,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (O || M) && (a.style.overflowY = "scroll"), (z || L) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: _ || j ? `calc(100dvh - ${_ + j}px)` : "100dvh",
      width: X || D ? `calc(100vw - ${X + D}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function b() {
    Object.assign(a.style, $y), Object.assign(i.style, eb), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = tb);
  }
  function v() {
    b(), m.request(d);
  }
  d();
  const x = Fe(c, "resize", v);
  return () => {
    m.cancel(), b(), typeof c.removeEventListener == "function" && x();
  };
}
class dR {
  lockCount = 0;
  restore = null;
  timeoutLock = nl.create();
  timeoutUnlock = nl.create();
  acquire(r) {
    return this.lockCount += 1, this.lockCount === 1 && this.restore === null && this.timeoutLock.start(0, () => this.lock(r)), this.release;
  }
  release = () => {
    this.lockCount -= 1, this.lockCount === 0 && this.restore && this.timeoutUnlock.start(0, this.unlock);
  };
  unlock = () => {
    this.lockCount === 0 && this.restore && (this.restore?.(), this.restore = null);
  };
  lock(r) {
    if (this.lockCount === 0 || this.restore !== null)
      return;
    const i = et(r).documentElement, c = At(i).getComputedStyle(i).overflowY;
    if (c === "hidden" || c === "clip") {
      this.restore = ln;
      return;
    }
    const f = vu || !sR(r);
    this.restore = f ? cR(r) : fR(r);
  }
}
const pR = new dR();
function Rv(n = !0, r = null) {
  xe(() => {
    if (n)
      return pR.acquire(r);
  }, [n, r]);
}
function ul(n) {
  n.preventDefault(), n.stopPropagation();
}
function gR(n) {
  return "nativeEvent" in n;
}
function ep(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : Rd && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function Tv(n) {
  return Wd ? !1 : !Rd && n.width === 0 && n.height === 0 || Rd && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function Jo(n, r) {
  const a = ["mouse", "pen"];
  return r || a.push("", void 0), a.includes(n);
}
function mR(n) {
  const r = n.type;
  return r === "click" || r === "mousedown" || r === "keydown" || r === "keyup";
}
const Td = "data-base-ui-focusable", Cv = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", xu = "ArrowLeft", Su = "ArrowRight", Ov = "ArrowUp", tp = "ArrowDown";
function hn(n) {
  let r = n.activeElement;
  for (; r?.shadowRoot?.activeElement != null; )
    r = r.shadowRoot.activeElement;
  return r;
}
function Le(n, r) {
  if (!n || !r)
    return !1;
  const a = r.getRootNode?.();
  if (n.contains(r))
    return !0;
  if (a && Fr(a)) {
    let i = r;
    for (; i; ) {
      if (n === i)
        return !0;
      i = i.parentNode || i.host;
    }
  }
  return !1;
}
function dn(n) {
  return "composedPath" in n ? n.composedPath()[0] : n.target;
}
function lu(n, r) {
  if (!Je(n))
    return !1;
  const a = n;
  if (r.hasElement(a))
    return !a.hasAttribute("data-trigger-disabled");
  for (const [, i] of r.entries())
    if (Le(i, a))
      return !i.hasAttribute("data-trigger-disabled");
  return !1;
}
function id(n, r) {
  if (r == null)
    return !1;
  if ("composedPath" in n)
    return n.composedPath().includes(r);
  const a = n;
  return a.target != null && r.contains(a.target);
}
function hR(n) {
  return n.matches("html,body");
}
function wu(n) {
  return Ct(n) && n.matches(Cv);
}
function yR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${Cv}`) != null;
}
function Cd(n) {
  return n ? n.getAttribute("role") === "combobox" && wu(n) : !1;
}
function bR(n) {
  if (!n || Wd)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function ou(n) {
  return n ? n.hasAttribute(Td) ? n : n.querySelector(`[${Td}]`) || n : null;
}
function vR(n, r) {
  return r != null && !Jo(r) ? 0 : typeof n == "function" ? n() : n;
}
function Wr(n, r, a) {
  const i = vR(n, a);
  return typeof i == "number" ? i : i?.[r];
}
function nb(n) {
  return typeof n == "function" ? n() : n;
}
function Mv(n, r) {
  return r || n === "click" || n === "mousedown";
}
function xR(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const Ro = "none", na = "trigger-press", on = "trigger-hover", Xr = "trigger-focus", Eu = "outside-press", Kr = "item-press", SR = "close-press", Wo = "focus-out", Ru = "escape-key", Od = "list-navigation", Av = "cancel-open", ti = "sibling-open", wR = "disabled", np = "imperative-action", ER = "window-resize";
function Ge(n, r, a, i) {
  let c = !1, f = !1;
  const p = i ?? Ot;
  return {
    reason: n,
    event: r ?? new Event("base-ui"),
    cancel() {
      c = !0;
    },
    allowPropagation() {
      f = !0;
    },
    get isCanceled() {
      return c;
    },
    get isPropagationAllowed() {
      return f;
    },
    trigger: a,
    ...p
  };
}
const zv = /* @__PURE__ */ y.createContext({
  hasProvider: !1,
  timeoutMs: 0,
  delayRef: {
    current: 0
  },
  initialDelayRef: {
    current: 0
  },
  timeout: new nl(),
  currentIdRef: {
    current: null
  },
  currentContextRef: {
    current: null
  }
});
function RR(n, r) {
  n.current = r.current;
}
function TR(n) {
  const {
    children: r,
    delay: a,
    timeoutMs: i = 0
  } = n, c = y.useRef(a), f = y.useRef(a), p = y.useRef(null), g = y.useRef(null), m = rn();
  return xe(() => {
    if (f.current = a, !p.current) {
      c.current = a;
      return;
    }
    c.current = {
      open: Wr(c.current, "open"),
      close: Wr(a, "close")
    };
  }, [a, p, c, f]), /* @__PURE__ */ k.jsx(zv.Provider, {
    value: y.useMemo(() => ({
      hasProvider: !0,
      delayRef: c,
      initialDelayRef: f,
      currentIdRef: p,
      timeoutMs: i,
      currentContextRef: g,
      timeout: m
    }), [i, m]),
    children: r
  });
}
function CR(n, r = {
  open: !1
}) {
  const {
    open: a
  } = r, i = "rootStore" in n ? n.rootStore : n, c = i.useState("floatingId"), f = y.useContext(zv), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: b,
    hasProvider: v,
    timeout: x
  } = f, [T, S] = y.useState(!1), C = y.useRef(a), R = y.useRef(!1);
  return xe(() => {
    C.current = a;
  }, [a]), xe(() => () => {
    R.current = !0;
  }, []), xe(() => {
    function A() {
      R.current || S(!1), b.current?.setIsInstantPhase(!1), p.current = null, b.current = null, g.current = d.current, x.clear();
    }
    if (p.current && !a && p.current === c) {
      if (S(!1), m) {
        const O = c;
        return x.start(m, () => {
          i.select("open") || p.current && p.current !== O || A();
        }), () => {
          (C.current || p.current !== O) && x.clear();
        };
      }
      A();
    }
  }, [a, c, p, g, m, d, b, x, i]), xe(() => {
    if (!a)
      return;
    const A = b.current, O = p.current;
    x.clear(), b.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: S
    }, p.current = c, g.current = {
      open: 0,
      close: Wr(d.current, "close")
    }, O !== null && O !== c ? (S(!0), A?.setIsInstantPhase(!0), A?.onOpenChange(!1, Ge(Ro))) : (S(!1), A?.setIsInstantPhase(!1));
  }, [a, c, i, p, g, d, b, x]), xe(() => () => {
    if (p.current === c) {
      if (b.current = null, !C.current)
        return;
      p.current = null, RR(g, d), x.clear();
    }
  }, [b, p, g, c, d, x]), y.useMemo(() => ({
    hasProvider: v,
    delayRef: g,
    isInstantPhase: T
  }), [v, g, T]);
}
function fl(...n) {
  return () => {
    for (let r = 0; r < n.length; r += 1) {
      const a = n[r];
      a && a();
    }
  };
}
function Vt(n) {
  const r = yn(OR, n).current;
  return r.next = n, xe(r.effect), r;
}
function OR(n) {
  const r = {
    current: n,
    next: n,
    effect: () => {
      r.current = r.next;
    }
  };
  return r;
}
const Dv = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, Nv = {
  ...Dv,
  position: "fixed",
  top: 0,
  left: 0
}, MR = {
  ...Dv,
  position: "absolute"
}, $r = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const [i, c] = y.useState();
  xe(() => {
    rR && Eo && c("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ k.jsx("span", {
    ...r,
    ref: a,
    style: Nv,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), AR = ["top", "right", "bottom", "left"], ea = Math.min, Bl = Math.max, ru = Math.round, Us = Math.floor, Il = (n) => ({
  x: n,
  y: n
}), zR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function _v(n, r, a) {
  return Bl(n, ea(r, a));
}
function Gl(n, r) {
  return typeof n == "function" ? n(r) : n;
}
function Un(n) {
  return n.split("-")[0];
}
function To(n) {
  return n.split("-")[1];
}
function lp(n) {
  return n === "x" ? "y" : "x";
}
function op(n) {
  return n === "y" ? "height" : "width";
}
function Jn(n) {
  const r = n[0];
  return r === "t" || r === "b" ? "y" : "x";
}
function rp(n) {
  return lp(Jn(n));
}
function DR(n, r, a) {
  a === void 0 && (a = !1);
  const i = To(n), c = rp(n), f = op(c);
  let p = c === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return r.reference[f] > r.floating[f] && (p = au(p)), [p, au(p)];
}
function NR(n) {
  const r = au(n);
  return [Md(n), r, Md(r)];
}
function Md(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const lb = ["left", "right"], ob = ["right", "left"], _R = ["top", "bottom"], kR = ["bottom", "top"];
function HR(n, r, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? r ? ob : lb : r ? lb : ob;
    case "left":
    case "right":
      return r ? _R : kR;
    default:
      return [];
  }
}
function jR(n, r, a, i) {
  const c = To(n);
  let f = HR(Un(n), a === "start", i);
  return c && (f = f.map((p) => p + "-" + c), r && (f = f.concat(f.map(Md)))), f;
}
function au(n) {
  const r = Un(n);
  return zR[r] + n.slice(r.length);
}
function UR(n) {
  var r, a, i, c;
  return {
    top: (r = n.top) != null ? r : 0,
    right: (a = n.right) != null ? a : 0,
    bottom: (i = n.bottom) != null ? i : 0,
    left: (c = n.left) != null ? c : 0
  };
}
function kv(n) {
  return typeof n != "number" ? UR(n) : {
    top: n,
    right: n,
    bottom: n,
    left: n
  };
}
function di(n) {
  const {
    x: r,
    y: a,
    width: i,
    height: c
  } = n;
  return {
    width: i,
    height: c,
    top: a,
    left: r,
    right: r + i,
    bottom: a + c,
    x: r,
    y: a
  };
}
function ri(n, r) {
  return r < 0 || r >= n.length;
}
function Fs(n, r) {
  return Ul(n.current, {
    disabledIndices: r
  });
}
function Ad(n, r) {
  return Ul(n.current, {
    decrement: !0,
    startingIndex: n.current.length,
    disabledIndices: r
  });
}
function Ul(n, {
  startingIndex: r = -1,
  decrement: a = !1,
  disabledIndices: i,
  amount: c = 1
} = {}) {
  let f = r;
  do
    f += a ? -c : c;
  while (f >= 0 && f <= n.length - 1 && iu(n, f, i));
  return f;
}
function iu(n, r, a) {
  if (typeof a == "function" ? a(r) : a?.includes(r) ?? !1)
    return !0;
  const c = n[r];
  return c ? Tu(c) ? !a && (c.hasAttribute("disabled") || c.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function LR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Tu(n, r = n ? Ln(n) : null) {
  return !n || !n.isConnected || !r || LR(r) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : r.display !== "none" && r.display !== "contents";
}
const BR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function IR(n) {
  const r = n.assignedSlot;
  if (r)
    return r;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return Fr(a) ? a.host : null;
}
function zd(n) {
  for (const r of Array.from(n.children))
    if (pn(r) === "summary")
      return r;
  return null;
}
function VR(n, r) {
  const a = zd(r);
  return !!a && (n === a || Le(a, n));
}
function Hv(n) {
  const r = n ? pn(n) : "";
  return n != null && n.matches(BR) && (r !== "summary" || n.parentElement != null && pn(n.parentElement) === "details" && zd(n.parentElement) === n) && (r !== "details" || zd(n) == null) && (r !== "input" || n.type !== "hidden");
}
function jv(n) {
  if (!Hv(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let r = n; r; r = IR(r)) {
    const a = r !== n, i = pn(r) === "slot";
    if (r.hasAttribute("inert") || a && pn(r) === "details" && !r.open && !VR(n, r) || r.hasAttribute("hidden") || !i && !YR(r, a))
      return !1;
  }
  return !0;
}
function YR(n, r) {
  const a = Ln(n);
  return r ? a.display !== "none" : Tu(n, a);
}
function Uv(n) {
  const r = n.tabIndex;
  if (r < 0) {
    const a = pn(n);
    if (a === "details" || a === "audio" || a === "video" || Ct(n) && n.isContentEditable)
      return 0;
  }
  return r;
}
function sd(n) {
  if (pn(n) !== "input")
    return null;
  const r = n;
  return r.type === "radio" && r.name !== "" ? r : null;
}
function GR(n, r) {
  const a = sd(n);
  if (!a)
    return !0;
  const i = r.find((c) => {
    const f = sd(c);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : r.find((c) => {
    const f = sd(c);
    return f?.name === a.name && f.form === a.form;
  }) === a;
}
function Lv(n) {
  if (Ct(n) && pn(n) === "slot") {
    const r = n.assignedElements({
      flatten: !0
    });
    if (r.length > 0)
      return r;
  }
  return Ct(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function Bv(n, r) {
  Lv(n).forEach((a) => {
    Hv(a) && r.push(a), Bv(a, r);
  });
}
function Iv(n, r, a) {
  Lv(n).forEach((i) => {
    Ct(i) && i.matches(r) && a.push(i), Iv(i, r, a);
  });
}
function ap(n) {
  return jv(n) && Uv(n) >= 0;
}
function Vv(n) {
  const r = [];
  return Bv(n, r), r.filter(jv);
}
function hi(n) {
  const r = Vv(n);
  return r.filter((a) => Uv(a) >= 0 && GR(a, r));
}
function Yv(n, r) {
  const a = hi(n), i = a.length;
  if (i === 0)
    return;
  const c = hn(et(n)), f = a.indexOf(c), p = f === -1 ? r === 1 ? 0 : i - 1 : f + r;
  return a[p];
}
function ip(n) {
  return Yv(et(n).body, 1) || n;
}
function Gv(n) {
  return Yv(et(n).body, -1) || n;
}
function qv(n, r) {
  if (!n)
    return null;
  const a = hi(et(n).body), i = a.length;
  if (i === 0)
    return null;
  const c = a.indexOf(n);
  if (c === -1)
    return null;
  const f = (c + r + i) % i;
  return a[f];
}
function qR(n) {
  return qv(n, 1);
}
function PR(n) {
  return qv(n, -1);
}
function Qr(n, r) {
  const a = r || n.currentTarget, i = n.relatedTarget;
  return !i || !Le(a, i);
}
function XR(n) {
  hi(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function rb(n) {
  const r = [];
  Iv(n, "[data-tabindex]", r), r.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
function So(n, r, a = !0) {
  return n.filter((c) => c.parentId === r).flatMap((c) => [...!a || c.context?.open ? [c] : [], ...So(n, c.id, a)]);
}
function ab(n, r) {
  let a = [], i = n.find((c) => c.id === r)?.parentId;
  for (; i; ) {
    const c = n.find((f) => f.id === i);
    i = c?.parentId, c && (a = a.concat(c));
  }
  return a;
}
function pi(n) {
  return `data-base-ui-${n}`;
}
let Ls = 0;
function Js(n, r = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: c
  } = r;
  cancelAnimationFrame(Ls);
  function f() {
    c && !c() || n?.focus({
      preventScroll: a
    });
  }
  if (i)
    return f(), ln;
  const p = requestAnimationFrame(f);
  return Ls = p, () => {
    Ls === p && (cancelAnimationFrame(p), Ls = 0);
  };
}
const ud = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, ib = "data-base-ui-inert", Dd = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let Ja = /* @__PURE__ */ new WeakMap(), cd = 0;
function KR(n) {
  return Dd[n];
}
function Pv(n) {
  return n ? Fr(n) ? n.host : Pv(n.parentNode) : null;
}
const sb = (n, r) => r.map((a) => {
  if (n.contains(a))
    return a;
  const i = Pv(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), ub = (n) => {
  const r = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !r.has(i); )
      r.add(i), i = i.parentNode;
  }), r;
}, cb = (n, r, a) => {
  const i = [], c = (f) => {
    !f || a.has(f) || Array.from(f.children).forEach((p) => {
      pn(p) !== "script" && (r.has(p) ? c(p) : i.push(p));
    });
  };
  return c(n), i;
};
function QR(n, r, a, i, {
  mark: c = !0
}) {
  let f = null;
  i ? f = "inert" : a && (f = "aria-hidden");
  let p = null, g = null;
  const m = sb(r, n), d = c ? cb(r, ub(m), new Set(m)) : [], b = [], v = [];
  if (f) {
    const x = ud[f], T = KR(f);
    g = T, p = x;
    const S = sb(r, Array.from(r.querySelectorAll("[aria-live]"))), C = m.concat(S);
    cb(r, ub(C), new Set(C)).forEach((A) => {
      const O = A.getAttribute(f), z = O !== null && O !== "false", M = (x.get(A) || 0) + 1;
      x.set(A, M), b.push(A), M === 1 && z && T.add(A), z || A.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return c && d.forEach((x) => {
    const T = (Ja.get(x) || 0) + 1;
    Ja.set(x, T), v.push(x), T === 1 && x.setAttribute(ib, "");
  }), cd += 1, () => {
    p && b.forEach((x) => {
      const S = (p.get(x) || 0) - 1;
      p.set(x, S), S || (!g?.has(x) && f && x.removeAttribute(f), g?.delete(x));
    }), c && v.forEach((x) => {
      const T = (Ja.get(x) || 0) - 1;
      Ja.set(x, T), T || x.removeAttribute(ib);
    }), cd -= 1, cd || (ud.inert = /* @__PURE__ */ new WeakMap(), ud["aria-hidden"] = /* @__PURE__ */ new WeakMap(), Dd.inert = /* @__PURE__ */ new WeakSet(), Dd["aria-hidden"] = /* @__PURE__ */ new WeakSet(), Ja = /* @__PURE__ */ new WeakMap());
  };
}
function fb(n, r = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: c = !0
  } = r, f = et(n[0]).body;
  return QR(n, f, a, i, {
    mark: c
  });
}
var ql = Fb();
let db = 0;
function ZR(n, r = "mui") {
  const [a, i] = y.useState(n), c = n || a;
  return y.useEffect(() => {
    a == null && (db += 1, i(`${r}-${db}`));
  }, [a, r]), c;
}
const pb = Yd.useId;
function $o(n, r) {
  if (pb !== void 0) {
    const a = pb();
    return n ?? (r ? `${r}-${a}` : a);
  }
  return ZR(n, r);
}
const FR = 500, JR = 500, WR = {
  style: {
    transition: "none"
  }
}, $R = "data-base-ui-click-trigger", Xv = {
  fallbackAxisSide: "none"
}, Kv = {
  fallbackAxisSide: "end"
}, eT = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, Qv = /* @__PURE__ */ y.createContext(null), Zv = () => y.useContext(Qv), tT = pi("portal");
function Fv(n = {}) {
  const {
    ref: r,
    container: a,
    componentProps: i = Ot,
    elementProps: c
  } = n, f = $o(), g = Zv()?.portalNode, [m, d] = y.useState(null), [b, v] = y.useState(null), x = De((R) => {
    R !== null && v(R);
  }), T = y.useRef(null);
  xe(() => {
    if (a === null) {
      T.current && (T.current = null, v(null), d(null));
      return;
    }
    if (f == null)
      return;
    const R = (a && (Bd(a) ? a : a.current)) ?? g ?? document.body;
    if (R == null) {
      T.current && (T.current = null, v(null), d(null));
      return;
    }
    T.current !== R && (T.current = R, v(null), d(R));
  }, [a, g, f]);
  const S = it("div", i, {
    ref: [r, x],
    props: [{
      id: f,
      [tT]: ""
    }, c]
  });
  return {
    portalNode: b,
    portalSubtree: m && S ? /* @__PURE__ */ ql.createPortal(S, m) : null
  };
}
const sp = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    children: p,
    container: g,
    renderGuards: m,
    ...d
  } = r, {
    portalNode: b,
    portalSubtree: v
  } = Fv({
    container: g,
    ref: a,
    componentProps: r,
    elementProps: d
  }), x = y.useRef(null), T = y.useRef(null), S = y.useRef(null), C = y.useRef(null), [R, A] = y.useState(null), O = y.useRef(!1), z = R?.modal, M = R?.open, L = typeof m == "boolean" ? m : !!R && !R.modal && R.open && !!b;
  y.useEffect(() => {
    if (!b || z)
      return;
    function j(_) {
      b && _.relatedTarget && Qr(_) && (_.type === "focusin" ? O.current && (rb(b), O.current = !1) : (XR(b), O.current = !0));
    }
    return fl(Fe(b, "focusin", j, !0), Fe(b, "focusout", j, !0));
  }, [b, z]), xe(() => {
    !b || M !== !0 || !O.current || (rb(b), O.current = !1);
  }, [M, b]);
  const D = y.useMemo(() => ({
    beforeOutsideRef: x,
    afterOutsideRef: T,
    beforeInsideRef: S,
    afterInsideRef: C,
    portalNode: b,
    setFocusManagerState: A
  }), [b]);
  return /* @__PURE__ */ k.jsxs(y.Fragment, {
    children: [v, /* @__PURE__ */ k.jsxs(Qv.Provider, {
      value: D,
      children: [L && b && /* @__PURE__ */ k.jsx($r, {
        "data-type": "outside",
        ref: x,
        onFocus: (j) => {
          if (Qr(j, b))
            S.current?.focus();
          else {
            const _ = R ? R.domReference : null;
            Gv(_)?.focus();
          }
        }
      }), L && b && /* @__PURE__ */ k.jsx("span", {
        "aria-owns": b.id,
        style: eT
      }), b && /* @__PURE__ */ ql.createPortal(p, b), L && b && /* @__PURE__ */ k.jsx($r, {
        "data-type": "outside",
        ref: T,
        onFocus: (j) => {
          if (Qr(j, b))
            C.current?.focus();
          else {
            const _ = R ? R.domReference : null;
            ip(_)?.focus(), R?.closeOnFocusOut && R?.onOpenChange(!1, Ge(Wo, j.nativeEvent));
          }
        }
      })]
    })]
  });
});
function Jv() {
  const n = /* @__PURE__ */ new Map();
  return {
    emit(r, a) {
      n.get(r)?.forEach((i) => i(a));
    },
    on(r, a) {
      n.has(r) || n.set(r, /* @__PURE__ */ new Set()), n.get(r).add(a);
    },
    off(r, a) {
      n.get(r)?.delete(a);
    }
  };
}
class up {
  nodesRef = {
    current: []
  };
  events = Jv();
  addNode(r) {
    this.nodesRef.current.push(r);
  }
  removeNode(r) {
    const a = this.nodesRef.current.findIndex((i) => i === r);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const Wv = /* @__PURE__ */ y.createContext(null), $v = /* @__PURE__ */ y.createContext(null), Co = () => y.useContext(Wv)?.id || null, Oo = (n) => {
  const r = y.useContext($v);
  return n ?? r;
};
function e0(n) {
  const r = $o(), a = Oo(n), i = Co();
  return xe(() => {
    if (!r)
      return;
    const c = {
      id: r,
      parentId: i
    };
    return a?.addNode(c), () => {
      a?.removeNode(c);
    };
  }, [a, r, i]), r;
}
function nT(n) {
  const {
    children: r,
    id: a
  } = n, i = Co();
  return /* @__PURE__ */ k.jsx(Wv.Provider, {
    value: y.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: r
  });
}
function lT(n) {
  const {
    children: r,
    externalTree: a
  } = n, i = yn(() => a ?? new up()).current;
  return /* @__PURE__ */ k.jsx($v.Provider, {
    value: i,
    children: r
  });
}
function Hl(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function oT(n, r) {
  const a = At(dn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? r || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? r || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const gb = 20;
let vo = [];
function cp() {
  vo = vo.filter((n) => n.deref()?.isConnected);
}
function mb(n) {
  cp(), n && pn(n) !== "body" && (vo.push(new WeakRef(n)), vo.length > gb && (vo = vo.slice(-gb)));
}
function hb() {
  return cp(), vo[vo.length - 1]?.deref();
}
function rT(n) {
  return n ? ap(n) ? n : hi(n)[0] || n : null;
}
function yb(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = Vv(n).filter((c) => {
    const f = c.getAttribute("data-tabindex") || "";
    return ap(c) || c.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function fp(n) {
  const {
    context: r,
    children: a,
    disabled: i = !1,
    initialFocus: c = !0,
    returnFocus: f = !0,
    restoreFocus: p = !1,
    modal: g = !0,
    closeOnFocusOut: m = !0,
    openInteractionType: d = "",
    nextFocusableElement: b,
    previousFocusableElement: v,
    beforeContentFocusGuardRef: x,
    externalTree: T,
    getInsideElements: S
  } = n, C = "rootStore" in r ? r.rootStore : r, R = C.useState("open"), A = C.useState("domReferenceElement"), O = C.useState("floatingElement"), {
    events: z,
    dataRef: M
  } = C.context, L = De(() => M.current.floatingContext?.nodeId), D = c === !1, j = Cd(A) && D, _ = Vt(c), X = Vt(f), q = Vt(d), re = Vt(R), Q = Oo(T), J = Zv(), Z = y.useRef(!1), G = y.useRef(!1), N = y.useRef(!1), Y = y.useRef(null), I = y.useRef(""), K = y.useRef(""), B = y.useRef(null), E = y.useRef(null), H = xo(B, x, J?.beforeInsideRef), te = xo(E, J?.afterInsideRef), ee = rn(), ie = rn(), ae = Jr(), le = J != null, se = ou(O), ge = De((fe = se) => fe ? hi(fe) : []), _e = De(() => S?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !g)
      return;
    function fe(Te) {
      Te.key === "Tab" && Le(se, hn(et(se))) && ge().length === 0 && !j && ul(Te);
    }
    const ye = et(se);
    return Fe(ye, "keydown", fe);
  }, [i, se, g, j, ge]), y.useEffect(() => {
    if (i || !R)
      return;
    const fe = et(se);
    function ye() {
      N.current = !1;
    }
    function Te(ke) {
      const we = dn(ke), Ce = _e(), he = Le(O, we) || Le(A, we) || Le(J?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      N.current = !he, K.current = ke.pointerType || "keyboard", we?.closest(`[${$R}]`) && (G.current = !0, ie.start(0, () => {
        G.current = !1;
      }));
    }
    function He() {
      K.current = "keyboard";
    }
    return fl(
      Fe(fe, "pointerdown", Te, !0),
      Fe(fe, "pointerup", ye, !0),
      Fe(fe, "pointercancel", ye, !0),
      Fe(fe, "keydown", He, !0),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      ye
    );
  }, [i, O, A, se, R, J, ie, _e]), y.useEffect(() => {
    if (i || !m)
      return;
    const fe = et(se);
    function ye() {
      G.current = !0, ie.start(0, () => {
        G.current = !1;
      });
    }
    function Te(Ce) {
      const he = dn(Ce);
      ap(he) && (Y.current = he);
    }
    function He(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Re = dn(Ce);
      g && he == null && Re != null && Le(O, Re) && mb(Re), queueMicrotask(() => {
        const Oe = L(), je = C.context.triggerElements, oe = _e(), pe = he?.hasAttribute(pi("focus-guard")) && [B.current, E.current, J?.beforeInsideRef.current, J?.afterInsideRef.current, J?.beforeOutsideRef.current, J?.afterOutsideRef.current, Hl(v), Hl(b)].includes(he), Ue = !(Le(A, he) || Le(O, he) || Le(he, O) || Le(J?.portalNode, he) || oe.some((be) => be === he || Le(be, he)) || he != null && je.hasElement(he) || je.hasMatchingElement((be) => Le(be, he)) || pe || Q && (So(Q.nodesRef.current, Oe).find((be) => Le(be.context?.elements.floating, he) || Le(be.context?.elements.domReference, he)) || ab(Q.nodesRef.current, Oe).find((be) => [be.context?.elements.floating, ou(be.context?.elements.floating)].includes(he) || be.context?.elements.domReference === he)));
        if (Se === A && se && yb(se), p && Se !== A && !Tu(Re) && hn(fe) === fe.body) {
          if (Ct(se) && (se.focus(), p === "popup")) {
            ae.request(() => {
              se.focus();
            });
            return;
          }
          const be = ge(), ve = Y.current, We = (ve && be.includes(ve) ? ve : null) || be[be.length - 1] || se;
          Ct(We) && We.focus();
        }
        if (M.current.insideReactTree) {
          M.current.insideReactTree = !1;
          return;
        }
        (j || !g) && he && Ue && !G.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (j || he !== hb()) && (Z.current = !0, C.setOpen(!1, Ge(Wo, Ce)));
      });
    }
    function ke() {
      N.current || (M.current.insideReactTree = !0, ee.start(0, () => {
        M.current.insideReactTree = !1;
      }));
    }
    const we = Ct(A) ? A : null;
    if (!(!O && !we))
      return fl(we && Fe(we, "focusout", He), we && Fe(we, "pointerdown", ye), O && Fe(O, "focusin", Te), O && Fe(O, "focusout", He), O && J && Fe(O, "focusout", ke, !0));
  }, [i, A, O, se, g, Q, J, C, m, p, ge, j, L, M, ee, ie, ae, b, v, _e]), y.useEffect(() => {
    if (i || !O || !R)
      return;
    const fe = Array.from(J?.portalNode?.querySelectorAll(`[${pi("portal")}]`) || []), Te = (Q ? ab(Q.nodesRef.current, L()) : []).find((Se) => Cd(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[O, ...fe, B.current, E.current, J?.beforeOutsideRef.current, J?.afterOutsideRef.current, ..._e()], Te, Hl(v), Hl(b), j ? A : null].filter((Se) => Se != null), we = fb(ke, {
      ariaHidden: g || j,
      mark: !1
    }), Ce = [O, ...fe].filter((Se) => Se != null), he = fb(Ce);
    return () => {
      he(), we();
    };
  }, [R, i, A, O, g, J, j, Q, L, b, v, _e]), xe(() => {
    if (!R || i || !Ct(se))
      return;
    const fe = et(se), ye = hn(fe);
    queueMicrotask(() => {
      const Te = _.current, He = typeof Te == "function" ? Te(q.current || "") : Te;
      if (He === void 0 || He === !1 || Le(se, ye))
        return;
      let we = null;
      const Ce = () => (we == null && (we = ge(se)), we[0] || se);
      let he;
      He === !0 || He === null ? he = Ce() : he = Hl(He), he = he || Ce();
      const Se = Le(se, hn(fe));
      Js(he, {
        preventScroll: he === se,
        shouldFocus() {
          if (!re.current)
            return !1;
          if (Se)
            return !0;
          const Re = hn(fe);
          return !(Re !== he && Le(se, Re));
        }
      });
    });
  }, [i, R, se, ge, _, q, re]), xe(() => {
    if (i || !se)
      return;
    const fe = et(se), ye = hn(fe), Te = q.current == null;
    mb(ye);
    function He(we) {
      if (we.open || (I.current = oT(we.nativeEvent, K.current)), we.reason === on && we.nativeEvent.type === "mouseleave" && (Z.current = !0), we.reason === Eu)
        if (we.nested)
          Z.current = !1;
        else if (ep(we.nativeEvent) || Tv(we.nativeEvent))
          Z.current = !1;
        else {
          let Ce = !1;
          et(se).createElement("div").focus({
            get preventScroll() {
              return Ce = !0, !1;
            }
          }), Ce ? Z.current = !1 : Z.current = !0;
        }
    }
    z.on("openchange", He);
    function ke() {
      const we = X.current;
      let Ce = typeof we == "function" ? we(I.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = A?.isConnected ? A : null, Se = ye?.isConnected && pn(ye) !== "body" ? ye : null;
      let Re = Te ? Se || he : he || Se;
      return Re || (Re = hb() || null), typeof Ce == "boolean" ? Re : Hl(Ce) || Re || null;
    }
    return () => {
      z.off("openchange", He);
      const we = hn(fe), Ce = _e(), he = Le(O, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || Q && So(Q.nodesRef.current, L(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = X.current, Re = ke();
      queueMicrotask(() => {
        const Oe = rT(Re), je = typeof Se != "boolean";
        Se && !Z.current && Ct(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!je && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), Z.current = !1;
      });
    };
  }, [i, O, se, X, q, z, Q, A, L, _e]), xe(() => {
    if (!Eo || R || !O)
      return;
    const fe = hn(et(O));
    !Ct(fe) || !wu(fe) || Le(O, fe) && fe.blur();
  }, [R, O]), xe(() => {
    if (!(i || !J))
      return J.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: R,
        onOpenChange: C.setOpen,
        domReference: A
      }), () => {
        J.setFocusManagerState(null);
      };
  }, [i, J, g, R, C, m, A]), xe(() => {
    if (!(i || !se))
      return yb(se), () => {
        queueMicrotask(cp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !j : !0) && (le || g);
  return /* @__PURE__ */ k.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ k.jsx($r, {
      "data-type": "inside",
      ref: H,
      onFocus: (fe) => {
        if (g) {
          const ye = ge();
          Js(ye[ye.length - 1]);
        } else J?.portalNode && (Z.current = !1, Qr(fe, J.portalNode) ? ip(A)?.focus() : Hl(v ?? J.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ k.jsx($r, {
      "data-type": "inside",
      ref: te,
      onFocus: (fe) => {
        g ? Js(ge()[0]) : J?.portalNode && (m && (Z.current = !0), Qr(fe, J.portalNode) ? Gv(A)?.focus() : Hl(b ?? J.afterOutsideRef)?.focus());
      }
    })]
  });
}
function dp(n, r = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: c = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = na
  } = r, d = "rootStore" in n ? n.rootStore : n, b = d.context.dataRef, v = y.useRef(void 0), x = Jr(), T = rn(), S = y.useMemo(() => {
    function C(A, O, z, M) {
      const L = Ge(m, O, z);
      A && M === "touch" && g > 0 ? T.start(g, () => {
        d.setOpen(!0, L);
      }) : d.setOpen(A, L);
    }
    function R(A, O, z) {
      const M = b.current.openEvent, L = d.select("domReferenceElement") !== O;
      return A && L || !A || !c ? !0 : M && p ? !z(M.type) : !1;
    }
    return {
      onPointerDown(A) {
        v.current = A.pointerType;
      },
      onMouseDown(A) {
        const O = v.current, z = A.nativeEvent, M = d.select("open");
        if (A.button !== 0 || i === "click" || Jo(O, !0) && f)
          return;
        const L = R(M, A.currentTarget, (_) => _ === "click" || _ === "mousedown"), D = dn(z);
        if (wu(D)) {
          C(L, z, D, O);
          return;
        }
        const j = A.currentTarget;
        x.request(() => {
          C(L, z, j, O);
        });
      },
      onClick(A) {
        if (i === "mousedown-only")
          return;
        const O = v.current;
        if (i === "mousedown" && O) {
          v.current = void 0;
          return;
        }
        if (Jo(O, !0) && f)
          return;
        const z = d.select("open"), M = R(z, A.currentTarget, (L) => L === "click" || L === "mousedown" || L === "keydown" || L === "keyup");
        C(M, A.nativeEvent, A.currentTarget, O);
      },
      onKeyDown() {
        v.current = void 0;
      }
    };
  }, [b, i, f, m, d, p, c, x, T, g]);
  return y.useMemo(() => a ? {
    reference: S
  } : Ot, [a, S]);
}
function aT(n, r) {
  let a = null, i = null, c = !1;
  return {
    contextElement: n || void 0,
    getBoundingClientRect() {
      const f = n?.getBoundingClientRect() || {
        width: 0,
        height: 0,
        x: 0,
        y: 0
      }, p = r.axis === "x" || r.axis === "both", g = r.axis === "y" || r.axis === "both", m = ["mouseenter", "mousemove"].includes(r.dataRef.current.openEvent?.type || "") && r.pointerType !== "touch";
      let d = f.width, b = f.height, v = f.x, x = f.y;
      return a == null && r.x && p && (a = f.x - r.x), i == null && r.y && g && (i = f.y - r.y), v -= a || 0, x -= i || 0, d = 0, b = 0, !c || m ? (d = r.axis === "y" ? f.width : 0, b = r.axis === "x" ? f.height : 0, v = p && r.x != null ? r.x : v, x = g && r.y != null ? r.y : x) : c && !m && (b = r.axis === "x" ? f.height : b, d = r.axis === "y" ? f.width : d), c = !0, {
        width: d,
        height: b,
        x: v,
        y: x,
        top: x,
        right: v + d,
        bottom: x + b,
        left: v
      };
    }
  };
}
function bb(n) {
  return n != null && n.clientX != null;
}
function iT(n, r = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = r, c = "rootStore" in n ? n.rootStore : n, f = c.useState("open"), p = c.useState("floatingElement"), g = c.useState("domReferenceElement"), m = c.context.dataRef, d = y.useRef(!1), b = y.useRef(null), [v, x] = y.useState(), [T, S] = y.useState([]), C = De((M) => {
    c.set("positionReference", M);
  }), R = De((M, L, D) => {
    d.current || m.current.openEvent && !bb(m.current.openEvent) || c.set("positionReference", aT(D ?? g, {
      x: M,
      y: L,
      axis: i,
      dataRef: m,
      pointerType: v
    }));
  }), A = De((M) => {
    f ? b.current || (R(M.clientX, M.clientY, M.currentTarget), S([])) : R(M.clientX, M.clientY, M.currentTarget);
  }), O = Jo(v) ? p : f;
  y.useEffect(() => {
    if (!a) {
      C(g);
      return;
    }
    if (!O)
      return;
    function M() {
      b.current?.(), b.current = null;
    }
    const L = At(p);
    function D(j) {
      const _ = dn(j);
      Le(p, _) ? M() : R(j.clientX, j.clientY);
    }
    return !m.current.openEvent || bb(m.current.openEvent) ? b.current = Fe(L, "mousemove", D) : C(g), M;
  }, [O, a, p, m, g, c, R, C, T]), y.useEffect(() => () => {
    c.set("positionReference", null);
  }, [c]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const z = y.useMemo(() => {
    function M(L) {
      x(L.pointerType);
    }
    return {
      onPointerDown: M,
      onPointerEnter: M,
      onMouseMove: A,
      onMouseEnter: A
    };
  }, [A]);
  return y.useMemo(() => a ? {
    reference: z,
    trigger: z
  } : {}, [a, z]);
}
function sT() {
  return !1;
}
function uT(n) {
  return {
    escapeKey: typeof n == "boolean" ? n : n?.escapeKey ?? !1,
    outsidePress: typeof n == "boolean" ? n : n?.outsidePress ?? !0
  };
}
function Cu(n, r = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: c = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = sT,
    bubbles: g,
    externalTree: m
  } = r, d = "rootStore" in n ? n.rootStore : n, b = d.useState("open"), v = d.useState("floatingElement"), {
    dataRef: x
  } = d.context, T = Oo(m), S = De(typeof c == "function" ? c : () => !1), C = typeof c == "function" ? S : c, R = C !== !1, A = De(() => f), {
    escapeKey: O,
    outsidePress: z
  } = uT(g), M = y.useRef(!1), L = y.useRef(!1), D = y.useRef(!1), j = y.useRef(!1), _ = y.useRef(""), X = y.useRef(null), q = rn(), re = rn(), Q = De(() => {
    re.clear(), x.current.insideReactTree = !1;
  }), J = De((H) => {
    const te = x.current.floatingContext?.nodeId;
    return (T ? So(T.nodesRef.current, te) : []).some((ie) => ie.context?.open && !ie.context.dataRef.current[H]);
  }), Z = De((H) => id(H, d.select("floatingElement")) || id(H, d.select("domReferenceElement"))), G = De((H) => {
    p() && d.setOpen(!1, Ge(na, H.nativeEvent));
  }), N = De((H) => {
    if (!b || !a || !i || H.key !== "Escape" || j.current || !O && J("__escapeKeyBubbles"))
      return;
    const te = gR(H) ? H.nativeEvent : H, ee = Ge(Ru, te);
    d.setOpen(!1, ee), ee.isCanceled || H.preventDefault(), !O && !ee.isPropagationAllowed && H.stopPropagation();
  }), Y = De(() => {
    x.current.insideReactTree = !0, re.start(0, Q);
  }), I = De((H) => {
    if (!b || !a || H.button !== 0)
      return;
    const te = dn(H.nativeEvent);
    Le(d.select("floatingElement"), te) && (M.current || (M.current = !0, L.current = !1));
  }), K = De((H) => {
    !b || !a || (H.defaultPrevented || H.nativeEvent.defaultPrevented) && M.current && (L.current = !0);
  });
  y.useEffect(() => {
    if (!b || !a)
      return;
    x.current.__escapeKeyBubbles = O, x.current.__outsidePressBubbles = z;
    const H = new nl(), te = new nl();
    function ee() {
      H.clear(), j.current = !0;
    }
    function ie() {
      H.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        Eo ? 5 : 0,
        () => {
          j.current = !1;
        }
      );
    }
    function ae() {
      D.current = !0, te.start(0, () => {
        D.current = !1;
      });
    }
    function le() {
      M.current = !1, L.current = !1;
    }
    function se() {
      const oe = _.current, pe = oe === "pen" || !oe ? "mouse" : oe, Ue = A(), be = typeof Ue == "function" ? Ue() : Ue;
      return typeof be == "string" ? be : be[pe];
    }
    function ge(oe) {
      const pe = se();
      return pe === "intentional" && oe.type !== "click" || pe === "sloppy" && oe.type === "click";
    }
    function _e(oe) {
      const pe = x.current.floatingContext?.nodeId, Ue = T && So(T.nodesRef.current, pe).some((be) => id(oe, be.context?.elements.floating));
      return Z(oe) || Ue;
    }
    function Ee(oe) {
      if (ge(oe)) {
        oe.type !== "click" && !Z(oe) && (te.clear(), D.current = !1), Q();
        return;
      }
      if (x.current.insideReactTree) {
        Q();
        return;
      }
      const pe = dn(oe), Ue = `[${pi("inert")}]`, be = Je(pe) ? pe.getRootNode() : null, ve = Array.from((Fr(be) ? be : et(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((pt) => Le(pt, pe))))
        return;
      let lt = Je(pe) ? pe : null;
      for (; lt && !Ll(lt); ) {
        const pt = Vl(lt);
        if (Ll(pt) || !Je(pt))
          break;
        lt = pt;
      }
      if (!(ve.length && Je(pe) && !hR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      ve.every((pt) => !Le(lt, pt)))) {
        if (Ct(pe) && !("touches" in oe)) {
          const pt = Ll(pe), zt = Ln(pe), $e = /auto|scroll/, gt = pt || $e.test(zt.overflowX), Mt = pt || $e.test(zt.overflowY), mt = gt && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, On = Mt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, Mn = zt.direction === "rtl", Qe = On && (Mn ? oe.offsetX <= pe.offsetWidth - pe.clientWidth : oe.offsetX > pe.clientWidth), ft = mt && oe.offsetY > pe.clientHeight;
          if (Qe || ft)
            return;
        }
        if (!_e(oe)) {
          if (se() === "intentional" && D.current) {
            te.clear(), D.current = !1;
            return;
          }
          typeof C == "function" && !C(oe) || J("__outsidePressBubbles") || (d.setOpen(!1, Ge(Eu, oe)), Q());
        }
      }
    }
    function fe(oe) {
      se() !== "sloppy" || oe.pointerType === "touch" || !d.select("open") || !a || Z(oe) || Ee(oe);
    }
    function ye(oe) {
      if (se() !== "sloppy" || !d.select("open") || !a || Z(oe))
        return;
      const pe = oe.touches[0];
      pe && (X.current = {
        startTime: Date.now(),
        startX: pe.clientX,
        startY: pe.clientY,
        dismissOnTouchEnd: !1,
        dismissOnMouseDown: !0
      }, q.start(1e3, () => {
        X.current && (X.current.dismissOnTouchEnd = !1, X.current.dismissOnMouseDown = !1);
      }));
    }
    function Te(oe, pe) {
      const Ue = dn(oe);
      if (!Ue)
        return;
      const be = Fe(Ue, oe.type, () => {
        pe(oe), be();
      });
    }
    function He(oe) {
      _.current = "touch", Te(oe, ye);
    }
    function ke(oe) {
      q.clear(), oe.type === "pointerdown" && (_.current = oe.pointerType), !(oe.type === "mousedown" && X.current && !X.current.dismissOnMouseDown) && Te(oe, (pe) => {
        pe.type === "pointerdown" ? fe(pe) : Ee(pe);
      });
    }
    function we(oe) {
      if (!M.current)
        return;
      const pe = L.current;
      if (le(), se() === "intentional") {
        if (oe.type === "pointercancel") {
          pe && ae();
          return;
        }
        if (!_e(oe)) {
          if (pe) {
            ae();
            return;
          }
          typeof C == "function" && !C(oe) || (te.clear(), D.current = !0, Q());
        }
      }
    }
    function Ce(oe) {
      if (se() !== "sloppy" || !X.current || Z(oe))
        return;
      const pe = oe.touches[0];
      if (!pe)
        return;
      const Ue = Math.abs(pe.clientX - X.current.startX), be = Math.abs(pe.clientY - X.current.startY), ve = Math.sqrt(Ue * Ue + be * be);
      ve > 5 && (X.current.dismissOnTouchEnd = !0), ve > 10 && (Ee(oe), q.clear(), X.current = null);
    }
    function he(oe) {
      Te(oe, Ce);
    }
    function Se(oe) {
      se() !== "sloppy" || !X.current || Z(oe) || (X.current.dismissOnTouchEnd && Ee(oe), q.clear(), X.current = null);
    }
    function Re(oe) {
      Te(oe, Se);
    }
    const Oe = et(v), je = fl(i && fl(Fe(Oe, "keydown", N), Fe(Oe, "compositionstart", ee), Fe(Oe, "compositionend", ie)), R && fl(Fe(Oe, "click", ke, !0), Fe(Oe, "pointerdown", ke, !0), Fe(Oe, "pointerup", we, !0), Fe(Oe, "pointercancel", we, !0), Fe(Oe, "mousedown", ke, !0), Fe(Oe, "mouseup", we, !0), Fe(Oe, "touchstart", He, !0), Fe(Oe, "touchmove", he, !0), Fe(Oe, "touchend", Re, !0)));
    return () => {
      je(), H.clear(), te.clear(), le(), D.current = !1;
    };
  }, [x, v, i, R, C, b, a, O, z, N, Q, A, J, Z, T, d, q]), y.useEffect(Q, [C, Q]);
  const B = y.useMemo(() => ({
    onKeyDown: N,
    onPointerDown: G,
    onClick: G
  }), [N, G]), E = y.useMemo(() => ({
    onKeyDown: N,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: K,
    onMouseDown: K,
    onClickCapture: Y,
    onMouseDownCapture(H) {
      Y(), I(H);
    },
    onPointerDownCapture(H) {
      Y(), I(H);
    },
    onMouseUpCapture: Y,
    onTouchEndCapture: Y,
    onTouchMoveCapture: Y
  }), [N, Y, I, K]);
  return y.useMemo(() => a ? {
    reference: B,
    floating: E,
    trigger: B
  } : {}, [a, B, E]);
}
function vb(n, r, a) {
  let {
    reference: i,
    floating: c
  } = n;
  const f = Jn(r), p = rp(r), g = op(p), m = Un(r), d = f === "y", b = i.x + i.width / 2 - c.width / 2, v = i.y + i.height / 2 - c.height / 2, x = i[g] / 2 - c[g] / 2;
  let T;
  switch (m) {
    case "top":
      T = {
        x: b,
        y: i.y - c.height
      };
      break;
    case "bottom":
      T = {
        x: b,
        y: i.y + i.height
      };
      break;
    case "right":
      T = {
        x: i.x + i.width,
        y: v
      };
      break;
    case "left":
      T = {
        x: i.x - c.width,
        y: v
      };
      break;
    default:
      T = {
        x: i.x,
        y: i.y
      };
  }
  const S = To(r);
  return S && (T[p] += x * (S === "end" ? 1 : -1) * (a && d ? -1 : 1)), T;
}
async function cT(n, r) {
  var a;
  r === void 0 && (r = {});
  const {
    x: i,
    y: c,
    platform: f,
    rects: p,
    elements: g,
    strategy: m
  } = n, {
    boundary: d = "clippingAncestors",
    rootBoundary: b = "viewport",
    elementContext: v = "floating",
    altBoundary: x = !1,
    padding: T = 0
  } = Gl(r, n), S = kv(T), R = g[x ? v === "floating" ? "reference" : "floating" : v], A = di(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(R))) == null || a ? R : R.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: b,
    strategy: m
  })), O = v === "floating" ? {
    x: i,
    y: c,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, z = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), M = await (f.isElement == null ? void 0 : f.isElement(z)) && await (f.getScale == null ? void 0 : f.getScale(z)) || {
    x: 1,
    y: 1
  }, L = di(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: O,
    offsetParent: z,
    strategy: m
  }) : O);
  return {
    top: (A.top - L.top + S.top) / M.y,
    bottom: (L.bottom - A.bottom + S.bottom) / M.y,
    left: (A.left - L.left + S.left) / M.x,
    right: (L.right - A.right + S.right) / M.x
  };
}
const fT = 50, dT = async (n, r, a) => {
  const {
    placement: i = "bottom",
    strategy: c = "absolute",
    middleware: f = [],
    platform: p
  } = a, g = p.detectOverflow ? p : {
    ...p,
    detectOverflow: cT
  }, m = await (p.isRTL == null ? void 0 : p.isRTL(r));
  let d = await p.getElementRects({
    reference: n,
    floating: r,
    strategy: c
  }), {
    x: b,
    y: v
  } = vb(d, i, m), x = i, T = 0;
  const S = {};
  for (let C = 0; C < f.length; C++) {
    const R = f[C];
    if (!R)
      continue;
    const {
      name: A,
      fn: O
    } = R, {
      x: z,
      y: M,
      data: L,
      reset: D
    } = await O({
      x: b,
      y: v,
      initialPlacement: i,
      placement: x,
      strategy: c,
      middlewareData: S,
      rects: d,
      platform: g,
      elements: {
        reference: n,
        floating: r
      }
    });
    b = z ?? b, v = M ?? v, S[A] = {
      ...S[A],
      ...L
    }, D && T < fT && (T++, typeof D == "object" && (D.placement && (x = D.placement), D.rects && (d = D.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: r,
      strategy: c
    }) : D.rects), {
      x: b,
      y: v
    } = vb(d, x, m)), C = -1);
  }
  return {
    x: b,
    y: v,
    placement: x,
    strategy: c,
    middlewareData: S
  };
}, pT = function(n) {
  return n === void 0 && (n = {}), {
    name: "flip",
    options: n,
    async fn(r) {
      var a, i;
      const {
        placement: c,
        middlewareData: f,
        rects: p,
        initialPlacement: g,
        platform: m,
        elements: d
      } = r, {
        mainAxis: b = !0,
        crossAxis: v = !0,
        fallbackPlacements: x,
        fallbackStrategy: T = "bestFit",
        fallbackAxisSideDirection: S = "none",
        flipAlignment: C = !0,
        ...R
      } = Gl(n, r);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const A = Un(c), O = Jn(g), z = Un(g) === g, M = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), L = x || (z || !C ? [au(g)] : NR(g)), D = S !== "none";
      !x && D && L.push(...jR(g, C, S, M));
      const j = [g, ...L], _ = await m.detectOverflow(r, R), X = [];
      let q = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (b && X.push(_[A]), v) {
        const Z = DR(c, p, M);
        X.push(_[Z[0]], _[Z[1]]);
      }
      if (q = [...q, {
        placement: c,
        overflows: X
      }], !X.every((Z) => Z <= 0)) {
        var re, Q;
        const Z = (((re = f.flip) == null ? void 0 : re.index) || 0) + 1, G = j[Z];
        if (G && (!(v === "alignment" ? O !== Jn(G) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        q.every((I) => Jn(I.placement) === O ? I.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Z,
              overflows: q
            },
            reset: {
              placement: G
            }
          };
        let N = (Q = q.filter((Y) => Y.overflows[0] <= 0).sort((Y, I) => Y.overflows[1] - I.overflows[1])[0]) == null ? void 0 : Q.placement;
        if (!N)
          switch (T) {
            case "bestFit": {
              var J;
              const Y = (J = q.filter((I) => {
                if (D) {
                  const K = Jn(I.placement);
                  return K === O || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  K === "y";
                }
                return !0;
              }).map((I) => [I.placement, I.overflows.filter((K) => K > 0).reduce((K, B) => K + B, 0)]).sort((I, K) => I[1] - K[1])[0]) == null ? void 0 : J[0];
              Y && (N = Y);
              break;
            }
            case "initialPlacement":
              N = g;
              break;
          }
        if (c !== N)
          return {
            reset: {
              placement: N
            }
          };
      }
      return {};
    }
  };
};
function xb(n, r) {
  return {
    top: n.top - r.height,
    right: n.right - r.width,
    bottom: n.bottom - r.height,
    left: n.left - r.width
  };
}
function Sb(n) {
  return AR.some((r) => n[r] >= 0);
}
const gT = function(n) {
  return n === void 0 && (n = {}), {
    name: "hide",
    options: n,
    async fn(r) {
      const {
        rects: a,
        platform: i
      } = r, {
        strategy: c = "referenceHidden",
        ...f
      } = Gl(n, r);
      switch (c) {
        case "referenceHidden": {
          const p = await i.detectOverflow(r, {
            ...f,
            elementContext: "reference"
          }), g = xb(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: Sb(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(r, {
            ...f,
            altBoundary: !0
          }), g = xb(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: Sb(g)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, t0 = /* @__PURE__ */ new Set(["left", "top"]);
async function mT(n, r) {
  const {
    placement: a,
    platform: i,
    elements: c
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(c.floating)), p = Un(a), g = To(a), m = Jn(a) === "y", d = t0.has(p) ? -1 : 1, b = f && m ? -1 : 1, v = Gl(r, n);
  let {
    mainAxis: x,
    crossAxis: T,
    alignmentAxis: S
  } = typeof v == "number" ? {
    mainAxis: v,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: v.mainAxis || 0,
    crossAxis: v.crossAxis || 0,
    alignmentAxis: v.alignmentAxis
  };
  return g && typeof S == "number" && (T = g === "end" ? S * -1 : S), m ? {
    x: T * b,
    y: x * d
  } : {
    x: x * d,
    y: T * b
  };
}
const hT = function(n) {
  return n === void 0 && (n = 0), {
    name: "offset",
    options: n,
    async fn(r) {
      var a, i;
      const {
        x: c,
        y: f,
        placement: p,
        middlewareData: g
      } = r, m = await mT(r, n);
      return p === ((a = g.offset) == null ? void 0 : a.placement) && (i = g.arrow) != null && i.alignmentOffset ? {} : {
        x: c + m.x,
        y: f + m.y,
        data: {
          ...m,
          placement: p
        }
      };
    }
  };
}, yT = function(n) {
  return n === void 0 && (n = {}), {
    name: "shift",
    options: n,
    async fn(r) {
      const {
        x: a,
        y: i,
        placement: c,
        platform: f
      } = r, {
        mainAxis: p = !0,
        crossAxis: g = !1,
        limiter: m = {
          fn: (O) => {
            let {
              x: z,
              y: M
            } = O;
            return {
              x: z,
              y: M
            };
          }
        },
        ...d
      } = Gl(n, r), b = {
        x: a,
        y: i
      }, v = await f.detectOverflow(r, d), x = Jn(c), T = lp(x);
      let S = b[T], C = b[x];
      const R = (O, z) => _v(z + v[O === "y" ? "top" : "left"], z, z - v[O === "y" ? "bottom" : "right"]);
      p && (S = R(T, S)), g && (C = R(x, C));
      const A = m.fn({
        ...r,
        [T]: S,
        [x]: C
      });
      return {
        ...A,
        data: {
          x: A.x - a,
          y: A.y - i,
          enabled: {
            [T]: p,
            [x]: g
          }
        }
      };
    }
  };
}, bT = function(n) {
  return n === void 0 && (n = {}), {
    options: n,
    fn(r) {
      var a, i;
      const {
        x: c,
        y: f,
        placement: p,
        rects: g,
        middlewareData: m
      } = r, {
        offset: d = 0,
        mainAxis: b = !0,
        crossAxis: v = !0
      } = Gl(n, r), x = {
        x: c,
        y: f
      }, T = Jn(p), S = lp(T);
      let C = x[S], R = x[T];
      const A = Gl(d, r), O = typeof A == "number" ? {
        mainAxis: A,
        crossAxis: 0
      } : {
        mainAxis: (a = A.mainAxis) != null ? a : 0,
        crossAxis: (i = A.crossAxis) != null ? i : 0
      };
      if (b) {
        const L = S === "y" ? "height" : "width", D = g.reference[S] - g.floating[L] + O.mainAxis, j = g.reference[S] + g.reference[L] - O.mainAxis;
        C < D ? C = D : C > j && (C = j);
      }
      if (v) {
        var z, M;
        const L = S === "y" ? "width" : "height", D = t0.has(Un(p)), j = g.reference[T] - g.floating[L] + (D && ((z = m.offset) == null ? void 0 : z[T]) || 0) + (D ? 0 : O.crossAxis), _ = g.reference[T] + g.reference[L] + (D ? 0 : ((M = m.offset) == null ? void 0 : M[T]) || 0) - (D ? O.crossAxis : 0);
        R < j ? R = j : R > _ && (R = _);
      }
      return {
        [S]: C,
        [T]: R
      };
    }
  };
}, vT = function(n) {
  return n === void 0 && (n = {}), {
    name: "size",
    options: n,
    async fn(r) {
      const {
        placement: a,
        rects: i,
        platform: c,
        elements: f
      } = r, {
        apply: p = () => {
        },
        ...g
      } = Gl(n, r), m = await c.detectOverflow(r, g), d = Un(a), b = To(a), v = Jn(a) === "y", {
        width: x,
        height: T
      } = i.floating;
      let S, C;
      d === "top" || d === "bottom" ? (S = d, C = b === (await (c.isRTL == null ? void 0 : c.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (C = d, S = b === "end" ? "top" : "bottom");
      const R = T - m.top - m.bottom, A = x - m.left - m.right, O = ea(T - m[S], R), z = ea(x - m[C], A), M = r.middlewareData.shift, L = !M;
      let D = O, j = z;
      M != null && M.enabled.x && (j = A), M != null && M.enabled.y && (D = R), L && !b && (v ? j = x - 2 * Bl(m.left, m.right) : D = T - 2 * Bl(m.top, m.bottom)), await p({
        ...r,
        availableWidth: j,
        availableHeight: D
      });
      const _ = await c.getDimensions(f.floating);
      return x !== _.width || T !== _.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function n0(n) {
  const r = Ln(n);
  let a = parseFloat(r.width) || 0, i = parseFloat(r.height) || 0;
  const c = Ct(n), f = c ? n.offsetWidth : a, p = c ? n.offsetHeight : i, g = ru(a) !== f || ru(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function pp(n) {
  return Je(n) ? n : n.contextElement;
}
function Zr(n) {
  const r = pp(n);
  if (!Ct(r))
    return Il(1);
  const a = r.getBoundingClientRect(), {
    width: i,
    height: c,
    $: f
  } = n0(r);
  let p = (f ? ru(a.width) : a.width) / i, g = (f ? ru(a.height) : a.height) / c;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const xT = /* @__PURE__ */ Il(0);
function l0(n) {
  const r = At(n);
  return !Vd() || !r.visualViewport ? xT : {
    x: r.visualViewport.offsetLeft,
    y: r.visualViewport.offsetTop
  };
}
function ST(n, r, a) {
  return r === void 0 && (r = !1), !!a && r && a === At(n);
}
function er(n, r, a, i) {
  r === void 0 && (r = !1), a === void 0 && (a = !1);
  const c = n.getBoundingClientRect(), f = pp(n);
  let p = Il(1);
  r && (i ? Je(i) && (p = Zr(i)) : p = Zr(n));
  const g = ST(f, a, i) ? l0(f) : Il(0);
  let m = (c.left + g.x) / p.x, d = (c.top + g.y) / p.y, b = c.width / p.x, v = c.height / p.y;
  if (f && i) {
    const x = At(f), T = Je(i) ? At(i) : i;
    let S = x, C = Sd(S);
    for (; C && T !== S; ) {
      const R = Zr(C), A = C.getBoundingClientRect(), O = Ln(C), z = A.left + (C.clientLeft + parseFloat(O.paddingLeft)) * R.x, M = A.top + (C.clientTop + parseFloat(O.paddingTop)) * R.y;
      m *= R.x, d *= R.y, b *= R.x, v *= R.y, m += z, d += M, S = At(C), C = Sd(S);
    }
  }
  return di({
    width: b,
    height: v,
    x: m,
    y: d
  });
}
function Ou(n, r) {
  const a = yu(n).scrollLeft;
  return r ? r.left + a : er(Pl(n)).left + a;
}
function o0(n, r) {
  const a = n.getBoundingClientRect(), i = a.left + r.scrollLeft - Ou(n, a), c = a.top + r.scrollTop;
  return {
    x: i,
    y: c
  };
}
function wT(n) {
  let {
    elements: r,
    rect: a,
    offsetParent: i,
    strategy: c
  } = n;
  const f = c === "fixed", p = Pl(i), g = r ? hu(r.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Il(1);
  const b = Il(0), v = Ct(i);
  if ((v || !f) && ((pn(i) !== "body" || nr(p)) && (m = yu(i)), v)) {
    const T = er(i);
    d = Zr(i), b.x = T.x + i.clientLeft, b.y = T.y + i.clientTop;
  }
  const x = p && !v && !f ? o0(p, m) : Il(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - m.scrollLeft * d.x + b.x + x.x,
    y: a.y * d.y - m.scrollTop * d.y + b.y + x.y
  };
}
function ET(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function RT(n) {
  const r = yu(n), a = n.ownerDocument.body, i = Bl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), c = Bl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -r.scrollLeft + Ou(n);
  const p = -r.scrollTop;
  return Ln(a).direction === "rtl" && (f += Bl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: c,
    x: f,
    y: p
  };
}
const TT = 25;
function CT(n, r, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", c = At(n), f = Pl(n), p = c.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, b = 0;
  if (p) {
    const x = !Vd() || r === "fixed";
    i ? x || (d = -p.offsetLeft, b = -p.offsetTop) : (g = p.width, m = p.height, x && (d = p.offsetLeft, b = p.offsetTop));
  }
  if (Ou(f) <= 0) {
    const x = f.ownerDocument, T = x.body, S = getComputedStyle(T), C = x.compatMode === "CSS1Compat" && parseFloat(S.marginLeft) + parseFloat(S.marginRight) || 0, R = Math.abs(f.clientWidth - T.clientWidth - C), A = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? R / 2 : R;
    A <= TT && (g -= A);
  }
  return {
    width: g,
    height: m,
    x: d,
    y: b
  };
}
function OT(n, r) {
  const a = er(n, !0, r === "fixed"), i = a.top + n.clientTop, c = a.left + n.clientLeft, f = Zr(n), p = n.clientWidth * f.x, g = n.clientHeight * f.y, m = c * f.x, d = i * f.y;
  return {
    width: p,
    height: g,
    x: m,
    y: d
  };
}
function wb(n, r, a) {
  let i;
  if (r === "viewport" || r === "layoutViewport")
    i = CT(n, a, r);
  else if (r === "document")
    i = RT(Pl(n));
  else if (Je(r))
    i = OT(r, a);
  else {
    const c = l0(n);
    i = {
      x: r.x - c.x,
      y: r.y - c.y,
      width: r.width,
      height: r.height
    };
  }
  return di(i);
}
function MT(n, r) {
  const a = r.get(n);
  if (a)
    return a;
  let i = ci(n, [], !1).filter((g) => Je(g) && pn(g) !== "body"), c = null;
  const f = Ln(n).position === "fixed";
  let p = f ? Vl(n) : n;
  for (; Je(p) && !Ll(p); ) {
    const g = Ln(p), m = Id(p), d = c ? c.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((v) => v !== p) : c = g, p = Vl(p);
  }
  return r.set(n, i), i;
}
function AT(n) {
  let {
    element: r,
    boundary: a,
    rootBoundary: i,
    strategy: c
  } = n;
  const p = [...a === "clippingAncestors" ? hu(r) ? [] : MT(r, this._c) : [].concat(a), i], g = wb(r, p[0], c);
  let m = g.top, d = g.right, b = g.bottom, v = g.left;
  for (let x = 1; x < p.length; x++) {
    const T = wb(r, p[x], c);
    m = Bl(T.top, m), d = ea(T.right, d), b = ea(T.bottom, b), v = Bl(T.left, v);
  }
  return {
    width: d - v,
    height: b - m,
    x: v,
    y: m
  };
}
function zT(n) {
  const {
    width: r,
    height: a
  } = n0(n);
  return {
    width: r,
    height: a
  };
}
function DT(n, r, a) {
  const i = Ct(r), c = Pl(r), f = a === "fixed", p = er(n, !0, f, r);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Il(0);
  if ((i || !f) && ((pn(r) !== "body" || nr(c)) && (g = yu(r)), i)) {
    const x = er(r, !0, f, r);
    m.x = x.x + r.clientLeft, m.y = x.y + r.clientTop;
  }
  !i && c && (m.x = Ou(c));
  const d = c && !i && !f ? o0(c, g) : Il(0), b = p.left + g.scrollLeft - m.x - d.x, v = p.top + g.scrollTop - m.y - d.y;
  return {
    x: b,
    y: v,
    width: p.width,
    height: p.height
  };
}
function fd(n) {
  return Ln(n).position === "static";
}
function Eb(n, r) {
  if (!Ct(n) || Ln(n).position === "fixed")
    return null;
  if (r)
    return r(n);
  let a = n.offsetParent;
  return Pl(n) === a && (a = a.ownerDocument.body), a;
}
function r0(n, r) {
  const a = At(n);
  if (hu(n))
    return a;
  if (!Ct(n)) {
    let c = Vl(n);
    for (; c && !Ll(c); ) {
      if (Je(c) && !fd(c))
        return c;
      c = Vl(c);
    }
    return a;
  }
  let i = Eb(n, r);
  for (; i && kE(i) && fd(i); )
    i = Eb(i, r);
  return i && Ll(i) && fd(i) && !Id(i) ? a : i || UE(n) || a;
}
const NT = async function(n) {
  const r = this.getOffsetParent || r0, a = this.getDimensions, i = await a(n.floating);
  return {
    reference: DT(n.reference, await r(n.floating), n.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function _T(n) {
  return Ln(n).direction === "rtl";
}
const a0 = {
  convertOffsetParentRelativeRectToViewportRelativeRect: wT,
  getDocumentElement: Pl,
  getClippingRect: AT,
  getOffsetParent: r0,
  getElementRects: NT,
  getClientRects: ET,
  getDimensions: zT,
  getScale: Zr,
  isElement: Je,
  isRTL: _T
};
function i0(n, r) {
  return n.x === r.x && n.y === r.y && n.width === r.width && n.height === r.height;
}
function kT(n, r, a) {
  let i = null, c;
  const f = Pl(n);
  function p() {
    var b;
    clearTimeout(c), (b = i) == null || b.disconnect(), i = null;
  }
  function g(b, v) {
    b === void 0 && (b = !1), v === void 0 && (v = 1), p();
    const x = n.getBoundingClientRect(), {
      left: T,
      top: S,
      width: C,
      height: R
    } = x;
    if (b || r(), !C || !R)
      return;
    const A = Us(S), O = Us(f.clientWidth - (T + C)), z = Us(f.clientHeight - (S + R)), M = Us(T), D = {
      rootMargin: -A + "px " + -O + "px " + -z + "px " + -M + "px",
      threshold: Bl(0, ea(1, v)) || 1
    };
    let j = !0;
    function _(X) {
      const q = X[0].intersectionRatio;
      if (!i0(x, n.getBoundingClientRect()))
        return g();
      if (q !== v) {
        if (!j)
          return g();
        q ? g(!1, q) : c = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      j = !1;
    }
    try {
      i = new IntersectionObserver(_, {
        ...D,
        // Handle <iframe>s
        root: f.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(_, D);
    }
    i.observe(n);
  }
  const m = At(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function Rb(n, r, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: c = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = pp(n), b = c || f ? [...d ? ci(d) : [], ...r ? ci(r) : []] : [];
  b.forEach((A) => {
    c && A.addEventListener("scroll", a), f && A.addEventListener("resize", a);
  });
  const v = d && g ? kT(d, a, f) : null;
  let x = -1, T = null;
  p && (T = new ResizeObserver((A) => {
    let [O] = A;
    O && O.target === d && T && r && (T.unobserve(r), cancelAnimationFrame(x), x = requestAnimationFrame(() => {
      var z;
      (z = T) == null || z.observe(r);
    })), a();
  }), d && !m && T.observe(d), r && T.observe(r));
  let S, C = m ? er(n) : null;
  m && R();
  function R() {
    const A = er(n);
    C && !i0(C, A) && a(), C = A, S = requestAnimationFrame(R);
  }
  return a(), () => {
    var A;
    b.forEach((O) => {
      c && O.removeEventListener("scroll", a), f && O.removeEventListener("resize", a);
    }), v?.(), (A = T) == null || A.disconnect(), T = null, m && cancelAnimationFrame(S);
  };
}
const HT = hT, jT = yT, UT = pT, LT = vT, BT = gT, IT = bT, VT = (n, r, a) => {
  const i = /* @__PURE__ */ new Map(), c = a ?? {}, f = {
    ...a0,
    ...c.platform,
    _c: i
  };
  return dT(n, r, {
    ...c,
    platform: f
  });
};
var YT = typeof document < "u", GT = function() {
}, Ws = YT ? y.useLayoutEffect : GT;
function su(n, r) {
  if (n === r)
    return !0;
  if (typeof n != typeof r)
    return !1;
  if (typeof n == "function" && n.toString() === r.toString())
    return !0;
  let a, i, c;
  if (n && r && typeof n == "object") {
    if (Array.isArray(n)) {
      if (a = n.length, a !== r.length) return !1;
      for (i = a; i-- !== 0; )
        if (!su(n[i], r[i]))
          return !1;
      return !0;
    }
    if (c = Object.keys(n), a = c.length, a !== Object.keys(r).length)
      return !1;
    for (i = a; i-- !== 0; )
      if (!{}.hasOwnProperty.call(r, c[i]))
        return !1;
    for (i = a; i-- !== 0; ) {
      const f = c[i];
      if (!(f === "_owner" && n.$$typeof) && !su(n[f], r[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && r !== r;
}
function s0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function Tb(n, r) {
  const a = s0(n);
  return Math.round(r * a) / a;
}
function dd(n) {
  const r = y.useRef(n);
  return Ws(() => {
    r.current = n;
  }), r;
}
function qT(n) {
  n === void 0 && (n = {});
  const {
    placement: r = "bottom",
    strategy: a = "absolute",
    middleware: i = [],
    platform: c,
    elements: {
      reference: f,
      floating: p
    } = {},
    transform: g = !0,
    whileElementsMounted: m,
    open: d
  } = n, [b, v] = y.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: r,
    middlewareData: {},
    isPositioned: !1
  }), [x, T] = y.useState(i);
  su(x, i) || T(i);
  const [S, C] = y.useState(null), [R, A] = y.useState(null), O = y.useCallback((I) => {
    I !== D.current && (D.current = I, C(I));
  }, []), z = y.useCallback((I) => {
    I !== j.current && (j.current = I, A(I));
  }, []), M = f || S, L = p || R, D = y.useRef(null), j = y.useRef(null), _ = y.useRef(b), X = m != null, q = dd(m), re = dd(c), Q = dd(d), J = y.useCallback(() => {
    if (!D.current || !j.current)
      return;
    const I = {
      placement: r,
      strategy: a,
      middleware: x
    };
    re.current && (I.platform = re.current), VT(D.current, j.current, I).then((K) => {
      const B = {
        ...K,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: Q.current !== !1
      };
      Z.current && !su(_.current, B) && (_.current = B, ql.flushSync(() => {
        v(B);
      }));
    });
  }, [x, r, a, re, Q]);
  Ws(() => {
    d === !1 && _.current.isPositioned && (_.current.isPositioned = !1, v((I) => ({
      ...I,
      isPositioned: !1
    })));
  }, [d]);
  const Z = y.useRef(!1);
  Ws(() => (Z.current = !0, () => {
    Z.current = !1;
  }), []), Ws(() => {
    if (M && (D.current = M), L && (j.current = L), M && L) {
      if (q.current)
        return q.current(M, L, J);
      J();
    }
  }, [M, L, J, q, X]);
  const G = y.useMemo(() => ({
    reference: D,
    floating: j,
    setReference: O,
    setFloating: z
  }), [O, z]), N = y.useMemo(() => ({
    reference: M,
    floating: L
  }), [M, L]), Y = y.useMemo(() => {
    const I = {
      position: a,
      left: 0,
      top: 0
    };
    if (!N.floating)
      return I;
    const K = Tb(N.floating, b.x), B = Tb(N.floating, b.y);
    return g ? {
      ...I,
      transform: "translate(" + K + "px, " + B + "px)",
      ...s0(N.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: K,
      top: B
    };
  }, [a, g, N.floating, b.x, b.y]);
  return y.useMemo(() => ({
    ...b,
    update: J,
    refs: G,
    elements: N,
    floatingStyles: Y
  }), [b, J, G, N, Y]);
}
const PT = (n, r) => {
  const a = HT(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, r]
  };
}, XT = (n, r) => {
  const a = jT(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, r]
  };
}, KT = (n, r) => ({
  fn: IT(n).fn,
  options: [n, r]
}), QT = (n, r) => {
  const a = UT(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, r]
  };
}, ZT = (n, r) => {
  const a = LT(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, r]
  };
}, FT = (n, r) => {
  const a = BT(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, r]
  };
}, me = (n, r, a, i, c, f, ...p) => {
  if (p.length > 0)
    throw new Error(Lt(1));
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
var pd = { exports: {} }, gd = {};
var Cb;
function JT() {
  if (Cb) return gd;
  Cb = 1;
  var n = mi();
  function r(v, x) {
    return v === x && (v !== 0 || 1 / v === 1 / x) || v !== v && x !== x;
  }
  var a = typeof Object.is == "function" ? Object.is : r, i = n.useState, c = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(v, x) {
    var T = x(), S = i({ inst: { value: T, getSnapshot: x } }), C = S[0].inst, R = S[1];
    return f(
      function() {
        C.value = T, C.getSnapshot = x, m(C) && R({ inst: C });
      },
      [v, T, x]
    ), c(
      function() {
        return m(C) && R({ inst: C }), v(function() {
          m(C) && R({ inst: C });
        });
      },
      [v]
    ), p(T), T;
  }
  function m(v) {
    var x = v.getSnapshot;
    v = v.value;
    try {
      var T = x();
      return !a(v, T);
    } catch {
      return !0;
    }
  }
  function d(v, x) {
    return x();
  }
  var b = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : g;
  return gd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : b, gd;
}
var Ob;
function u0() {
  return Ob || (Ob = 1, pd.exports = JT()), pd.exports;
}
var c0 = u0(), md = { exports: {} }, hd = {};
var Mb;
function WT() {
  if (Mb) return hd;
  Mb = 1;
  var n = mi(), r = u0();
  function a(d, b) {
    return d === b && (d !== 0 || 1 / d === 1 / b) || d !== d && b !== b;
  }
  var i = typeof Object.is == "function" ? Object.is : a, c = r.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return hd.useSyncExternalStoreWithSelector = function(d, b, v, x, T) {
    var S = f(null);
    if (S.current === null) {
      var C = { hasValue: !1, value: null };
      S.current = C;
    } else C = S.current;
    S = g(
      function() {
        function A(D) {
          if (!O) {
            if (O = !0, z = D, D = x(D), T !== void 0 && C.hasValue) {
              var j = C.value;
              if (T(j, D))
                return M = j;
            }
            return M = D;
          }
          if (j = M, i(z, D)) return j;
          var _ = x(D);
          return T !== void 0 && T(j, _) ? (z = D, j) : (z = D, M = _);
        }
        var O = !1, z, M, L = v === void 0 ? null : v;
        return [
          function() {
            return A(b());
          },
          L === null ? void 0 : function() {
            return A(L());
          }
        ];
      },
      [b, v, x, T]
    );
    var R = c(d, S[0], S[1]);
    return p(
      function() {
        C.hasValue = !0, C.value = R;
      },
      [R]
    ), m(R), R;
  }, hd;
}
var Ab;
function $T() {
  return Ab || (Ab = 1, md.exports = WT()), md.exports;
}
var eC = $T();
const Nd = [];
let _d;
function tC() {
  return _d;
}
function nC(n) {
  Nd.push(n);
}
function gp(n) {
  const r = (a, i) => {
    const c = yn(lC).current;
    let f;
    try {
      _d = c;
      for (const p of Nd)
        p.before(c);
      f = n(a, i);
      for (const p of Nd)
        p.after(c);
      c.didInitialize = !0;
    } finally {
      _d = void 0;
    }
    return f;
  };
  return r.displayName = n.displayName || n.name, r;
}
function f0(n) {
  return /* @__PURE__ */ y.forwardRef(gp(n));
}
function lC() {
  return {
    didInitialize: !1
  };
}
const oC = Xd(19), rC = oC ? iC : sC;
function Ye(n, r, a, i, c) {
  return rC(n, r, a, i, c);
}
function aC(n, r, a, i, c) {
  const f = y.useCallback(() => r(n.getSnapshot(), a, i, c), [n, r, a, i, c]);
  return c0.useSyncExternalStore(n.subscribe, f, f);
}
nC({
  before(n) {
    n.syncIndex = 0, n.didInitialize || (n.syncTick = 1, n.syncHooks = [], n.didChangeStore = !0, n.getSnapshot = () => {
      let r = !1;
      for (let a = 0; a < n.syncHooks.length; a += 1) {
        const i = n.syncHooks[a], c = i.selector(i.store.state, i.a1, i.a2, i.a3);
        Object.is(i.value, c) || (r = !0, i.value = c);
      }
      return r && (n.syncTick += 1), n.syncTick;
    });
  },
  after(n) {
    n.syncHooks.length > 0 && (n.didChangeStore && (n.didChangeStore = !1, n.subscribe = (r) => {
      const a = /* @__PURE__ */ new Set();
      for (const c of n.syncHooks)
        a.add(c.store);
      const i = [];
      for (const c of a)
        i.push(c.subscribe(r));
      return () => {
        for (const c of i)
          c();
      };
    }), c0.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function iC(n, r, a, i, c) {
  const f = tC();
  if (!f)
    return aC(n, r, a, i, c);
  const p = f.syncIndex;
  f.syncIndex += 1;
  let g;
  return f.didInitialize ? (g = f.syncHooks[p], (g.store !== n || g.selector !== r || !Object.is(g.a1, a) || !Object.is(g.a2, i) || !Object.is(g.a3, c)) && (g.store !== n && (f.didChangeStore = !0), g.store = n, g.selector = r, g.a1 = a, g.a2 = i, g.a3 = c, g.value = r(n.getSnapshot(), a, i, c))) : (g = {
    store: n,
    selector: r,
    a1: a,
    a2: i,
    a3: c,
    value: r(n.getSnapshot(), a, i, c)
  }, f.syncHooks.push(g)), g.value;
}
function sC(n, r, a, i, c) {
  return eC.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => r(f, a, i, c));
}
class d0 {
  /**
   * The current state of the store.
   * This property is updated immediately when the state changes as a result of calling {@link setState}, {@link update}, or {@link set}.
   * To subscribe to state changes, use the {@link useState} method. The value returned by {@link useState} is updated after the component renders (similarly to React's useState).
   * The values can be used directly (to avoid subscribing to the store) in effects or event handlers.
   *
   * Do not modify properties in state directly. Instead, use the provided methods to ensure proper state management and listener notification.
   */
  // Internal state to handle recursive `setState()` calls
  constructor(r) {
    this.state = r, this.listeners = /* @__PURE__ */ new Set(), this.updateTick = 0;
  }
  /**
   * Registers a listener that will be called whenever the store's state changes.
   *
   * @param fn The listener function to be called on state changes.
   * @returns A function to unsubscribe the listener.
   */
  subscribe = (r) => (this.listeners.add(r), () => {
    this.listeners.delete(r);
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
  setState(r) {
    if (this.state === r)
      return;
    this.state = r, this.updateTick += 1;
    const a = this.updateTick;
    for (const i of this.listeners) {
      if (a !== this.updateTick)
        return;
      i(r);
    }
  }
  /**
   * Merges the provided changes into the current state and notifies listeners if there are changes.
   *
   * @param changes An object containing the changes to apply to the current state.
   */
  update(r) {
    for (const a in r)
      if (!Object.is(this.state[a], r[a])) {
        this.setState({
          ...this.state,
          ...r
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
  set(r, a) {
    Object.is(this.state[r], a) || this.setState({
      ...this.state,
      [r]: a
    });
  }
  /**
   * Gives the state a new reference and updates all registered listeners.
   */
  notifyAll() {
    const r = {
      ...this.state
    };
    this.setState(r);
  }
  use(r, a, i, c) {
    return Ye(this, r, a, i, c);
  }
}
class Mu extends d0 {
  /**
   * Creates a new ReactStore instance.
   *
   * @param state Initial state of the store.
   * @param context Non-reactive context values.
   * @param selectors Optional selectors for use with `useState`.
   */
  constructor(r, a = {}, i) {
    super(r), this.context = a, this.selectors = i;
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
  useSyncedValue(r, a) {
    y.useDebugValue(r);
    const i = this;
    xe(() => {
      i.state[r] !== a && i.set(r, a);
    }, [i, r, a]);
  }
  /**
   * Synchronizes a single external value into the store and
   * cleans it up (sets to `undefined`) on unmount.
   *
   * Note that the while the value in `state` is updated immediately, the value returned
   * by `useState` is updated before the next render (similarly to React's `useState`).
   */
  useSyncedValueWithCleanup(r, a) {
    const i = this;
    xe(() => (i.state[r] !== a && i.set(r, a), () => {
      i.set(r, void 0);
    }), [i, r, a]);
  }
  /**
   * Synchronizes multiple external values into the store.
   *
   * Note that the while the values in `state` are updated immediately, the values returned
   * by `useState` are updated before the next render (similarly to React's `useState`).
   */
  useSyncedValues(r) {
    const a = this, i = Object.values(r);
    xe(() => {
      a.update(r);
    }, [a, ...i]);
  }
  /**
   * Registers a controllable prop pair (`controlled`, `defaultValue`) for a specific key. If `controlled`
   * is non-undefined, the store's state at `key` is updated to match `controlled`.
   */
  useControlledProp(r, a) {
    y.useDebugValue(r);
    const i = this, c = a !== void 0;
    xe(() => {
      c && !Object.is(i.state[r], a) && i.setState({
        ...i.state,
        [r]: a
      });
    }, [i, r, a, c]);
  }
  /** Gets the current value from the store using a selector with the provided key.
   *
   * @param key Key of the selector to use.
   */
  select(r, a, i, c) {
    const f = this.selectors[r];
    return f(this.state, a, i, c);
  }
  /**
   * Returns a value from the store's state using a selector function.
   * Used to subscribe to specific parts of the state.
   * This methods causes a rerender whenever the selected state changes.
   *
   * @param key Key of the selector to use.
   */
  useState(r, a, i, c) {
    return y.useDebugValue(r), Ye(this, this.selectors[r], a, i, c);
  }
  /**
   * Wraps a function with `useStableCallback` to ensure it has a stable reference
   * and assigns it to the context.
   *
   * @param key Key of the event callback. Must be a function in the context.
   * @param fn Function to assign.
   */
  useContextCallback(r, a) {
    y.useDebugValue(r);
    const i = De(a ?? ln);
    this.context[r] = i;
  }
  /**
   * Returns a stable setter function for a specific key in the store's state.
   * It's commonly used to pass as a ref callback to React elements.
   *
   * @param key Key of the state to set.
   */
  useStateSetter(r) {
    const a = y.useRef(void 0);
    return a.current === void 0 && (a.current = (i) => {
      this.set(r, i);
    }), a.current;
  }
  /**
   * Observes changes derived from the store's selectors and calls the listener when the selected value changes.
   *
   * @param key Key of the selector to observe.
   * @param listener Listener function called when the selector result changes.
   */
  observe(r, a) {
    let i;
    typeof r == "function" ? i = r : i = this.selectors[r];
    let c = i(this.state);
    return a(c, c, this), this.subscribe((f) => {
      const p = i(f);
      if (!Object.is(c, p)) {
        const g = c;
        c = p, a(p, g, this);
      }
    });
  }
}
const uC = {
  open: me((n) => n.open),
  transitionStatus: me((n) => n.transitionStatus),
  domReferenceElement: me((n) => n.domReferenceElement),
  referenceElement: me((n) => n.positionReference ?? n.referenceElement),
  floatingElement: me((n) => n.floatingElement),
  floatingId: me((n) => n.floatingId)
};
class Au extends Mu {
  constructor(r) {
    const {
      syncOnly: a,
      nested: i,
      onOpenChange: c,
      triggerElements: f,
      ...p
    } = r;
    super({
      ...p,
      positionReference: p.referenceElement,
      domReferenceElement: p.referenceElement
    }, {
      onOpenChange: c,
      dataRef: {
        current: {}
      },
      events: Jv(),
      nested: i,
      triggerElements: f
    }, uC), this.syncOnly = a;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (r, a) => {
    (!r || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    a != null && mR(a)) && (this.context.dataRef.current.openEvent = r ? a : void 0);
  };
  /**
   * Runs the root-owned side effects for an open state change.
   */
  dispatchOpenChange = (r, a) => {
    this.syncOpenEvent(r, a.event);
    const i = {
      open: r,
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
  setOpen = (r, a) => {
    if (this.syncOnly) {
      this.context.onOpenChange?.(r, a);
      return;
    }
    this.dispatchOpenChange(r, a), this.context.onOpenChange?.(r, a);
  };
}
function p0(n) {
  const {
    popupStore: r,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: c,
    nested: f,
    onOpenChange: p
  } = n, g = r.useState("open"), m = r.useState("activeTriggerElement"), d = r.useState(a ? "popupElement" : "positionerElement"), b = r.context.triggerElements, v = p, x = y.useRef(null);
  i === void 0 && x.current === null && (x.current = new Au({
    open: g,
    transitionStatus: void 0,
    referenceElement: m,
    floatingElement: d,
    triggerElements: b,
    onOpenChange: v,
    floatingId: c,
    syncOnly: !0,
    nested: f
  }));
  const T = i ?? x.current;
  return r.useSyncedValue("floatingId", c), xe(() => {
    const S = {
      open: g,
      floatingId: c,
      referenceElement: m,
      floatingElement: d
    };
    Je(m) && (S.domReferenceElement = m), T.state.positionReference === T.state.referenceElement && (S.positionReference = m), T.update(S);
  }, [g, c, m, d, T]), T.context.onOpenChange = v, T.context.nested = f, T;
}
function zu(n, r = !1, a = !1) {
  const [i, c] = y.useState(n && r ? "idle" : void 0), [f, p] = y.useState(n);
  return n && !f && (p(!0), c("starting")), !n && f && i !== "ending" && !a && c("ending"), !n && !f && i === "ending" && c(void 0), xe(() => {
    if (!n && f && i !== "ending" && a) {
      const g = cl.request(() => {
        c("ending");
      });
      return () => {
        cl.cancel(g);
      };
    }
  }, [n, f, i, a]), xe(() => {
    if (!n || r)
      return;
    const g = cl.request(() => {
      c(void 0);
    });
    return () => {
      cl.cancel(g);
    };
  }, [r, n]), xe(() => {
    if (!n || !r)
      return;
    n && f && i !== "idle" && c("starting");
    const g = cl.request(() => {
      c("idle");
    });
    return () => {
      cl.cancel(g);
    };
  }, [r, n, f, i]), {
    mounted: f,
    setMounted: p,
    transitionStatus: i
  };
}
let gi = /* @__PURE__ */ (function(n) {
  return n.startingStyle = "data-starting-style", n.endingStyle = "data-ending-style", n;
})({});
const cC = {
  [gi.startingStyle]: ""
}, fC = {
  [gi.endingStyle]: ""
}, rr = {
  transitionStatus(n) {
    return n === "starting" ? cC : n === "ending" ? fC : null;
  }
};
function g0(n, r = !1, a = !0) {
  const i = Jr();
  return De((c, f = null) => {
    i.cancel();
    const p = Hl(n);
    if (p == null)
      return;
    const g = p, m = () => {
      ql.flushSync(c);
    };
    if (typeof g.getAnimations != "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      c();
      return;
    }
    function d() {
      Promise.all(g.getAnimations().map((b) => b.finished)).then(() => {
        f?.aborted || m();
      }).catch(() => {
        if (a) {
          f?.aborted || m();
          return;
        }
        const b = g.getAnimations();
        !f?.aborted && b.length > 0 && b.some((v) => v.pending || v.playState !== "finished") && d();
      });
    }
    if (r) {
      const b = gi.startingStyle;
      if (!g.hasAttribute(b)) {
        i.request(d);
        return;
      }
      const v = new MutationObserver(() => {
        g.hasAttribute(b) || (v.disconnect(), d());
      });
      v.observe(g, {
        attributes: !0,
        attributeFilter: [b]
      }), f?.addEventListener("abort", () => v.disconnect(), {
        once: !0
      });
      return;
    }
    i.request(d);
  });
}
function Mo(n) {
  const {
    enabled: r = !0,
    open: a,
    ref: i,
    onComplete: c
  } = n, f = De(c), p = g0(i, a, !1);
  y.useEffect(() => {
    if (!r)
      return;
    const g = new AbortController();
    return p(f, g.signal), () => {
      g.abort();
    };
  }, [r, a, f, p]);
}
const Du = {
  tabIndex: -1,
  [Td]: ""
};
function dC(n) {
  return (r) => r === "touch" ? n.current : !0;
}
function m0(n, r, a = !1) {
  const i = $o(), c = Co() != null, f = y.useRef(null);
  n === void 0 && f.current === null && (f.current = r(i, c));
  const p = n ?? f.current;
  return p0({
    popupStore: p,
    treatPopupAsFloatingElement: a,
    floatingRootContext: p.state.floatingRootContext,
    floatingId: i,
    nested: c,
    onOpenChange: p.setOpen
  }), {
    store: p,
    internalStore: f.current
  };
}
function h0(n, r) {
  const a = y.useRef(null), i = y.useRef(null);
  return y.useCallback((c) => {
    if (n === void 0)
      return;
    let f = !1;
    if (a.current !== null) {
      const p = a.current, g = i.current, m = r.context.triggerElements.getById(p);
      g && m === g && (r.context.triggerElements.delete(p), f = !0), a.current = null, i.current = null;
    }
    if (c !== null && (a.current = n, i.current = c, r.context.triggerElements.add(n, c), f = !0), f) {
      const p = r.context.triggerElements.size;
      r.select("open") && r.state.triggerCount !== p && r.set("triggerCount", p);
    }
  }, [r, n]);
}
function mp(n, r, a, i = !1) {
  r ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const c = a?.id ?? null;
  (c || r) && (n.activeTriggerId = c, n.activeTriggerElement = a ?? null);
}
function y0(n) {
  let r = !1;
  return n.preventUnmountOnClose = () => {
    r = !0;
  }, () => r;
}
function pC(n, r, a, i = {}) {
  const c = a.reason, f = c === on, p = r && c === Xr, g = !r && (c === na || c === Ru), m = y0(a);
  if (n.context.onOpenChange?.(r, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(r, a);
  const d = () => {
    const b = {
      ...i.extraState,
      open: r
    };
    p ? b.instantType = "focus" : g ? b.instantType = "dismiss" : f && (b.instantType = void 0), mp(b, r, a.trigger, m()), n.update(b);
  };
  f ? ql.flushSync(d) : d();
}
function b0(n, r, a, i) {
  Fd(() => {
    r === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function v0(n, r, a, i) {
  const c = a.useState("isMountedByTrigger", n), f = h0(n, a), p = De((g) => {
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
    c && a.update({
      activeTriggerElement: r.current,
      ...i
    });
  }, [c, a, r, ...Object.values(i)]), {
    registerTrigger: p,
    isMountedByThisTrigger: c
  };
}
function hp(n, r = {}) {
  const {
    closeOnActiveTriggerUnmount: a = !1
  } = r, i = n.useState("open"), c = n.useState("triggerCount");
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
        const [b, v] = d.value;
        p.activeTriggerId = b, p.activeTriggerElement = v;
      }
    }
    (p.triggerCount !== void 0 || p.activeTriggerId !== void 0 || p.activeTriggerElement !== void 0) && n.update(p), m && a && queueMicrotask(() => {
      if (n.select("open") && n.select("activeTriggerId") === m && !n.context.triggerElements.getById(m)) {
        const d = Ge(Ro);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, c, a]);
}
function yp(n, r, a) {
  const {
    mounted: i,
    setMounted: c,
    transitionStatus: f
  } = zu(n), p = r.useState("preventUnmountingOnClose"), g = n ? !1 : p;
  r.useSyncedValues({
    mounted: i,
    transitionStatus: f,
    preventUnmountingOnClose: g
  });
  const m = De(() => {
    c(!1), r.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: !1,
      preventUnmountingOnClose: !1
    }), a?.(), r.context.onOpenChangeComplete?.(!1);
  });
  return Mo({
    enabled: i && !n && !g,
    open: n,
    ref: r.context.popupRef,
    onComplete() {
      n || m();
    }
  }), {
    forceUnmount: m,
    transitionStatus: f
  };
}
function bp(n, r) {
  n.useSyncedValues(r), xe(() => () => {
    n.update({
      activeTriggerProps: Ot,
      inactiveTriggerProps: Ot,
      popupProps: Ot
    });
  }, [n]);
}
function gC(n, r) {
  xe(() => {
    !r && n.state.openMethod !== null && n.set("openMethod", null);
  }, [r, n]), xe(() => () => {
    n.state.openMethod !== null && n.set("openMethod", null);
  }, [n]);
}
class yi {
  constructor() {
    this.elementsSet = /* @__PURE__ */ new Set(), this.idMap = /* @__PURE__ */ new Map();
  }
  /**
   * Adds a trigger element with the given ID.
   *
   * Note: The provided element is assumed to not be registered under multiple IDs.
   */
  add(r, a) {
    const i = this.idMap.get(r);
    i !== a && (i !== void 0 && this.elementsSet.delete(i), this.elementsSet.add(a), this.idMap.set(r, a));
  }
  /**
   * Removes the trigger element with the given ID.
   */
  delete(r) {
    const a = this.idMap.get(r);
    a && (this.elementsSet.delete(a), this.idMap.delete(r));
  }
  /**
   * Whether the given element is registered as a trigger.
   */
  hasElement(r) {
    return this.elementsSet.has(r);
  }
  /**
   * Whether there is a registered trigger element matching the given predicate.
   */
  hasMatchingElement(r) {
    for (const a of this.elementsSet)
      if (r(a))
        return !0;
    return !1;
  }
  /**
   * Returns the trigger element associated with the given ID, or undefined if no such element exists.
   */
  getById(r) {
    return this.idMap.get(r);
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
function mC() {
  return new Au({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new yi(),
    floatingId: void 0,
    syncOnly: !1,
    nested: !1,
    onOpenChange: void 0
  });
}
function vp() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: void 0,
    floatingRootContext: mC(),
    floatingId: void 0,
    triggerCount: 0,
    preventUnmountingOnClose: !1,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: Ot,
    inactiveTriggerProps: Ot,
    popupProps: Ot
  };
}
function x0(n, r, a = !1) {
  return new Au({
    open: !1,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: n,
    floatingId: r,
    syncOnly: !0,
    nested: a,
    onOpenChange: void 0
  });
}
const ai = me((n) => n.triggerIdProp ?? n.activeTriggerId), xp = me((n) => n.openProp ?? n.open), zb = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function S0(n, r) {
  return r !== void 0 && xp(n) && ai(n) === r;
}
function hC(n, r) {
  return S0(n, r) ? !0 : r !== void 0 && xp(n) && ai(n) == null && n.triggerCount === 1;
}
const Sp = {
  open: xp,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: ai,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: zb,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, r) => r !== void 0 && ai(n) === r),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, r) => S0(n, r)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, r) => r !== void 0 && ai(n) === r && n.mounted),
  triggerProps: me((n, r) => r ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, r) => hC(n, r) ? zb(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function w0(n) {
  const {
    open: r = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, c = $o(), f = Co() != null, p = yn(() => new Au({
    open: r,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new yi(),
    floatingId: c,
    syncOnly: !1,
    nested: f
  })).current;
  return xe(() => {
    const g = {
      open: r,
      floatingId: c
    };
    i.reference !== void 0 && (g.referenceElement = i.reference, g.domReferenceElement = Je(i.reference) ? i.reference : null), i.floating !== void 0 && (g.floatingElement = i.floating), p.update(g);
  }, [r, c, i.reference, i.floating, p]), p.context.onOpenChange = a, p.context.nested = f, p;
}
function yC(n = {}) {
  const {
    nodeId: r,
    externalTree: a
  } = n, i = w0(n), c = n.rootContext || i, f = c.useState("referenceElement"), p = c.useState("floatingElement"), g = c.useState("domReferenceElement"), m = c.useState("open"), d = c.useState("floatingId"), [b, v] = y.useState(null), [x, T] = y.useState(void 0), [S, C] = y.useState(void 0), R = y.useRef(null), A = Oo(a), O = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), z = qT({
    ...n,
    elements: {
      ...O,
      ...b && {
        reference: b
      }
    }
  }), M = Je(x) ? x : null, L = S === void 0 ? c.state.floatingElement : S;
  c.useSyncedValue("referenceElement", x ?? null), c.useSyncedValue("domReferenceElement", x === void 0 ? g : M), c.useSyncedValue("floatingElement", L);
  const D = y.useCallback((Q) => {
    const J = Je(Q) ? {
      getBoundingClientRect: () => Q.getBoundingClientRect(),
      getClientRects: () => Q.getClientRects(),
      contextElement: Q
    } : Q;
    v(J), z.refs.setReference(J);
  }, [z.refs]), j = y.useCallback((Q) => {
    (Je(Q) || Q === null) && (R.current = Q, T(Q)), (Je(z.refs.reference.current) || z.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    Q !== null && !Je(Q)) && z.refs.setReference(Q);
  }, [z.refs, T]), _ = y.useCallback((Q) => {
    C(Q), z.refs.setFloating(Q);
  }, [z.refs]), X = y.useMemo(() => ({
    ...z.refs,
    setReference: j,
    setFloating: _,
    setPositionReference: D,
    domReference: R
  }), [z.refs, j, _, D]), q = y.useMemo(() => ({
    ...z.elements,
    domReference: g
  }), [z.elements, g]), re = y.useMemo(() => ({
    ...z,
    dataRef: c.context.dataRef,
    open: m,
    onOpenChange: c.setOpen,
    events: c.context.events,
    floatingId: d,
    refs: X,
    elements: q,
    nodeId: r,
    rootStore: c
  }), [z, X, q, r, c, m, d]);
  return xe(() => {
    g && (R.current = g);
  }, [g]), xe(() => {
    c.context.dataRef.current.floatingContext = re;
    const Q = A?.nodesRef.current.find((J) => J.id === r);
    Q && (Q.context = re);
  }), y.useMemo(() => ({
    ...z,
    context: re,
    refs: X,
    elements: q,
    rootStore: c
  }), [z, X, q, re, c]);
}
const yd = Jd && Eo;
function E0(n, r = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = r, c = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = c.context, g = y.useRef(!1), m = y.useRef(null), d = y.useRef(!0), b = rn();
  y.useEffect(() => {
    const x = c.select("domReferenceElement");
    if (!a)
      return;
    const T = At(x);
    function S() {
      const A = c.select("domReferenceElement");
      !c.select("open") && Ct(A) && A === hn(et(A)) && (g.current = !0);
    }
    function C() {
      d.current = !0;
    }
    function R() {
      d.current = !1;
    }
    return fl(Fe(T, "blur", S), yd && Fe(T, "keydown", C, !0), yd && Fe(T, "pointerdown", R, !0));
  }, [c, a]), y.useEffect(() => {
    if (!a)
      return;
    function x(T) {
      if (T.reason === na || T.reason === Ru) {
        const S = c.select("domReferenceElement");
        Je(S) && (m.current = S, g.current = !0);
      }
    }
    return f.on("openchange", x), () => {
      f.off("openchange", x);
    };
  }, [f, a, c]);
  const v = y.useMemo(() => {
    function x() {
      g.current = !1, m.current = null;
    }
    return {
      onMouseLeave() {
        x();
      },
      onFocus(T) {
        const S = T.currentTarget;
        if (g.current) {
          if (m.current === S)
            return;
          x();
        }
        const C = dn(T.nativeEvent);
        if (Je(C)) {
          if (yd && !T.relatedTarget) {
            if (!d.current && !wu(C))
              return;
          } else if (!bR(C))
            return;
        }
        const R = lu(T.relatedTarget, c.context.triggerElements), {
          nativeEvent: A,
          currentTarget: O
        } = T, z = typeof i == "function" ? i() : i;
        if (c.select("open") && R || z === 0 || z === void 0) {
          c.setOpen(!0, Ge(Xr, A, O));
          return;
        }
        b.start(z, () => {
          g.current || c.setOpen(!0, Ge(Xr, A, O));
        });
      },
      onBlur(T) {
        x();
        const S = T.relatedTarget, C = T.nativeEvent, R = Je(S) && S.hasAttribute(pi("focus-guard")) && S.getAttribute("data-type") === "outside";
        b.start(0, () => {
          const A = c.select("domReferenceElement"), O = hn(et(A));
          !S && O === A || Le(p.current.floatingContext?.refs.floating.current, O) || Le(A, O) || R || lu(S ?? O, c.context.triggerElements) || c.setOpen(!1, Ge(Xr, C));
        });
      }
    };
  }, [p, i, c, b]);
  return y.useMemo(() => a ? {
    reference: v,
    trigger: v
  } : {}, [a, v]);
}
class wp {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new nl(), this.restTimeout = new nl(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new wp();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const uu = /* @__PURE__ */ new WeakMap();
function cu(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const r = n.pointerEventsScopeElement;
  r && uu.get(r) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), uu.delete(r)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function R0(n, r) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: c
  } = r, f = uu.get(a);
  f && f !== n && cu(f), cu(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = c, uu.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", c.style.pointerEvents = "auto";
}
function Ep(n) {
  const r = n.context.dataRef.current, a = yn(() => r.hoverInteractionState ?? wp.create()).current;
  return r.hoverInteractionState || (r.hoverInteractionState = a), $d(r.hoverInteractionState.disposeEffect), r.hoverInteractionState;
}
function T0(n, r = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: c
  } = r, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, b = Oo(), v = Co(), x = Ep(f), T = rn(), S = De(() => Mv(d.current.openEvent?.type, x.interactedInside)), C = De(() => xR(d.current.openEvent?.type)), R = De(() => {
    cu(x);
  });
  xe(() => {
    p || (x.pointerType = void 0, x.restTimeoutPending = !1, x.interactedInside = !1, R());
  }, [p, x, R]), y.useEffect(() => R, [R]), xe(() => {
    if (a && p && x.handleCloseOptions?.blockPointerEvents && C() && Je(m) && g) {
      const A = m, O = g, z = et(g), M = b?.nodesRef.current.find((_) => _.id === v)?.context?.elements.floating;
      M && (M.style.pointerEvents = "");
      const L = x.pointerEventsScopeElement !== O ? x.pointerEventsScopeElement : null, D = M !== O ? M : null, j = x.handleCloseOptions?.getScope?.() ?? L ?? D ?? A.closest("[data-rootownerid]") ?? z.body;
      return R0(x, {
        scopeElement: j,
        referenceElement: A,
        floatingElement: O
      }), () => {
        R();
      };
    }
  }, [a, p, m, g, x, C, b, v, R]), y.useEffect(() => {
    if (!a)
      return;
    function A() {
      return !!(b && v && So(b.nodesRef.current, v).length > 0);
    }
    function O(_) {
      const X = Wr(i, "close", x.pointerType), q = () => {
        f.setOpen(!1, Ge(on, _)), b?.events.emit("floating.closed", _);
      };
      X ? x.openChangeTimeout.start(X, q) : (x.openChangeTimeout.clear(), q());
    }
    function z(_) {
      const X = dn(_);
      if (!yR(X)) {
        x.interactedInside = !1;
        return;
      }
      x.interactedInside = X?.closest("[aria-haspopup]") != null;
    }
    function M() {
      x.openChangeTimeout.clear(), T.clear(), b?.events.off("floating.closed", D), R();
    }
    function L(_) {
      if (A() && b) {
        b.events.on("floating.closed", D);
        return;
      }
      if (lu(_.relatedTarget, f.context.triggerElements))
        return;
      const X = d.current.floatingContext?.nodeId ?? c, q = _.relatedTarget;
      if (!(b && X && Je(q) && So(b.nodesRef.current, X, !1).some((Q) => Le(Q.context?.elements.floating, q)))) {
        if (x.handler) {
          x.handler(_);
          return;
        }
        R(), C() && !S() && O(_);
      }
    }
    function D(_) {
      !b || !v || A() || T.start(0, () => {
        b.events.off("floating.closed", D), f.setOpen(!1, Ge(on, _)), b.events.emit("floating.closed", _);
      });
    }
    const j = g;
    return fl(j && Fe(j, "mouseenter", M), j && Fe(j, "mouseleave", L), j && Fe(j, "pointerdown", z, !0), () => {
      b?.events.off("floating.closed", D);
    });
  }, [a, g, f, d, i, c, C, S, R, x, b, v, T]);
}
const bC = {
  current: null
};
function Rp(n, r = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: c = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: g = !0,
    triggerElementRef: m = bC,
    externalTree: d,
    isActiveTrigger: b = !0,
    getHandleCloseContext: v,
    isClosing: x,
    shouldOpen: T
  } = r, S = "rootStore" in n ? n.rootStore : n, {
    dataRef: C,
    events: R
  } = S.context, A = Oo(d), O = Ep(S), z = y.useRef(!1), M = Vt(c), L = Vt(i), D = Vt(p), j = Vt(a), _ = Vt(T), X = Vt(x), q = De(() => Mv(C.current.openEvent?.type, O.interactedInside)), re = De(() => _.current?.() !== !1), Q = De((G, N, Y) => {
    const I = S.context.triggerElements;
    if (I.hasElement(N))
      return !G || !Le(G, N);
    if (!Je(Y))
      return !1;
    const K = Y;
    return I.hasMatchingElement((B) => Le(B, K)) && (!G || !Le(G, K));
  }), J = De(() => {
    if (!O.handler)
      return;
    et(S.select("domReferenceElement")).removeEventListener("mousemove", O.handler), O.handler = void 0;
  }), Z = De(() => {
    cu(O);
  });
  return b && (O.handleCloseOptions = M.current?.__options), y.useEffect(() => J, [J]), y.useEffect(() => {
    if (!a)
      return;
    function G(N) {
      N.open ? z.current = !1 : (z.current = N.reason === on, J(), O.openChangeTimeout.clear(), O.restTimeout.clear(), O.blockMouseMove = !0, O.restTimeoutPending = !1);
    }
    return R.on("openchange", G), () => {
      R.off("openchange", G);
    };
  }, [a, R, O, J]), y.useEffect(() => {
    if (!a)
      return;
    function G(K, B = !0) {
      const E = Wr(L.current, "close", O.pointerType);
      E ? O.openChangeTimeout.start(E, () => {
        S.setOpen(!1, Ge(on, K)), A?.events.emit("floating.closed", K);
      }) : B && (O.openChangeTimeout.clear(), S.setOpen(!1, Ge(on, K)), A?.events.emit("floating.closed", K));
    }
    const N = m.current ?? (b ? S.select("domReferenceElement") : null);
    if (!Je(N))
      return;
    function Y(K) {
      if (O.openChangeTimeout.clear(), O.blockMouseMove = !1, f && !Jo(O.pointerType))
        return;
      const B = nb(D.current), E = Wr(L.current, "open", O.pointerType), H = dn(K), te = K.currentTarget ?? null, ee = S.select("domReferenceElement");
      let ie = te;
      if (Je(H) && !S.context.triggerElements.hasElement(H)) {
        for (const Te of S.context.triggerElements.elements())
          if (Le(Te, H)) {
            ie = Te;
            break;
          }
      }
      Je(te) && Je(ee) && !S.context.triggerElements.hasElement(te) && Le(te, ee) && (ie = ee);
      const ae = ie == null ? !1 : Q(ee, ie, H), le = S.select("open"), se = X.current?.() ?? S.select("transitionStatus") === "ending", ge = !le && se && z.current, _e = !ae && Je(ie) && Je(ee) && Le(ee, ie) && ge, Ee = B > 0 && !E, fe = ae && (le || ge) || _e, ye = !le || ae;
      if (fe) {
        re() && S.setOpen(!0, Ge(on, K, ie));
        return;
      }
      Ee || (E ? O.openChangeTimeout.start(E, () => {
        ye && re() && S.setOpen(!0, Ge(on, K, ie));
      }) : ye && re() && S.setOpen(!0, Ge(on, K, ie)));
    }
    function I(K) {
      if (q()) {
        Z();
        return;
      }
      J();
      const B = S.select("domReferenceElement"), E = et(B);
      O.restTimeout.clear(), O.restTimeoutPending = !1;
      const H = C.current.floatingContext ?? v?.();
      if (lu(K.relatedTarget, S.context.triggerElements))
        return;
      if (M.current && H) {
        S.select("open") || O.openChangeTimeout.clear();
        const ee = m.current;
        O.handler = M.current({
          ...H,
          tree: A,
          x: K.clientX,
          y: K.clientY,
          onClose() {
            Z(), J(), j.current && !q() && ee === S.select("domReferenceElement") && G(K, !0);
          }
        }), E.addEventListener("mousemove", O.handler), O.handler(K);
        return;
      }
      (O.pointerType !== "touch" || !Le(S.select("floatingElement"), K.relatedTarget)) && G(K);
    }
    return g ? fl(Fe(N, "mousemove", Y, {
      once: !0
    }), Fe(N, "mouseenter", Y), Fe(N, "mouseleave", I)) : fl(Fe(N, "mouseenter", Y), Fe(N, "mouseleave", I));
  }, [J, Z, C, L, S, a, M, O, b, Q, q, f, g, D, m, A, j, v, X, re]), y.useMemo(() => {
    if (!a)
      return;
    function G(N) {
      O.pointerType = N.pointerType;
    }
    return {
      onPointerDown: G,
      onPointerEnter: G,
      onMouseMove(N) {
        const {
          nativeEvent: Y
        } = N, I = N.currentTarget, K = S.select("domReferenceElement"), B = S.select("open"), E = Q(K, I, N.target);
        if (f && !Jo(O.pointerType))
          return;
        if (B && E && O.handleCloseOptions?.blockPointerEvents) {
          const ee = S.select("floatingElement");
          if (ee) {
            const ie = O.handleCloseOptions?.getScope?.() ?? I.ownerDocument.body;
            R0(O, {
              scopeElement: ie,
              referenceElement: I,
              floatingElement: ee
            });
          }
        }
        const H = nb(D.current);
        if (B && !E || H === 0 || !E && O.restTimeoutPending && N.movementX ** 2 + N.movementY ** 2 < 2)
          return;
        O.restTimeout.clear();
        function te() {
          if (O.restTimeoutPending = !1, q())
            return;
          const ee = S.select("open");
          !O.blockMouseMove && (!ee || E) && re() && S.setOpen(!0, Ge(on, Y, I));
        }
        O.pointerType === "touch" ? ql.flushSync(() => {
          te();
        }) : E && B ? te() : (O.restTimeoutPending = !0, O.restTimeout.start(H, te));
      }
    };
  }, [a, O, q, Q, f, S, D, re]);
}
const vC = "Escape";
function Nu(n, r, a) {
  switch (n) {
    case "vertical":
      return r;
    case "horizontal":
      return a;
    default:
      return r || a;
  }
}
function Bs(n, r) {
  return Nu(r, n === Ov || n === tp, n === xu || n === Su);
}
function bd(n, r, a) {
  return Nu(r, n === tp, a ? n === xu : n === Su) || n === "Enter" || n === " " || n === "";
}
function xC(n, r, a) {
  return Nu(r, a ? n === xu : n === Su, n === tp);
}
function SC(n, r, a, i) {
  const c = a ? n === Su : n === xu, f = n === Ov;
  return r === "both" || r === "horizontal" && i ? n === vC : Nu(r, c, f);
}
function C0(n, r) {
  const {
    listRef: a,
    activeIndex: i,
    onNavigate: c = () => {
    },
    enabled: f = !0,
    selectedIndex: p = null,
    allowEscape: g = !1,
    loopFocus: m = !1,
    nested: d = !1,
    rtl: b = !1,
    virtual: v = !1,
    focusItemOnOpen: x = "auto",
    focusItemOnHover: T = !0,
    openOnArrowKeyDown: S = !0,
    disabledIndices: C = void 0,
    orientation: R = "vertical",
    parentOrientation: A,
    id: O,
    resetOnPointerLeave: z = !0,
    externalTree: M,
    grid: L
  } = r, D = L != null, j = "rootStore" in n ? n.rootStore : n, _ = j.useState("open"), X = j.useState("floatingElement"), q = j.useState("domReferenceElement"), re = j.context.dataRef, Q = ou(X), J = Cd(q), Z = Vt(Q), G = Co(), N = Oo(M), Y = y.useRef(x), I = y.useRef(p ?? -1), K = y.useRef(null), B = y.useRef(!0), E = De((oe) => {
    c(I.current === -1 ? null : I.current, oe);
  }), H = y.useRef(!!X), te = y.useRef(_), ee = y.useRef(!1), ie = y.useRef(!1), ae = y.useRef(null), le = Vt(C), se = Vt(_), ge = Vt(p), _e = Vt(z), Ee = Jr(), fe = Jr(), ye = De(() => {
    function oe(ve) {
      v ? N?.events.emit("virtualfocus", ve) : ae.current = Js(ve, {
        sync: ee.current,
        preventScroll: !0
      });
    }
    const pe = a.current[I.current], Ue = ie.current;
    pe && oe(pe), (ee.current ? (ve) => ve() : (ve) => Ee.request(ve))(() => {
      const ve = a.current[I.current] || pe;
      if (!ve)
        return;
      pe || oe(ve), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      he && (Ue || !B.current) && ve.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  xe(() => {
    re.current.orientation = R;
  }, [re, R]), xe(() => {
    f && (_ && X ? (I.current = p ?? -1, Y.current && p != null && (ie.current = !0, E())) : H.current && (I.current = -1, E()));
  }, [f, _, X, p, E]), xe(() => {
    if (f) {
      if (!_) {
        ee.current = !1;
        return;
      }
      if (X)
        if (i == null) {
          if (ee.current = !1, ge.current != null)
            return;
          if (H.current && (I.current = -1, ye()), (!te.current || !H.current) && Y.current && (K.current != null || Y.current === !0 && K.current == null)) {
            let oe = 0;
            const pe = () => {
              a.current[0] == null ? (oe < 2 && (oe ? (be) => fe.request(be) : queueMicrotask)(pe), oe += 1) : (I.current = K.current == null || bd(K.current, R, b) || d ? Fs(a) : Ad(a), K.current = null, E());
            };
            pe();
          }
        } else ri(a.current, i) || (I.current = i, ye(), ie.current = !1);
    }
  }, [f, _, X, i, ge, d, a, R, b, E, ye, fe]), xe(() => {
    if (!f || X || !N || v || !H.current)
      return;
    const oe = N.nodesRef.current, pe = oe.find((ve) => ve.id === G)?.context?.elements.floating, Ue = hn(et(q ?? pe ?? null)), be = oe.some((ve) => ve.context && Le(ve.context.elements.floating, Ue));
    pe && !be && B.current && pe.focus({
      preventScroll: !0
    });
  }, [f, X, q, N, G, v]), xe(() => {
    te.current = _, H.current = !!X;
  }), xe(() => {
    _ || (K.current = null, Y.current = x);
  }, [_, x]);
  const Te = i != null, He = De((oe) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(oe.currentTarget);
    pe !== -1 && (I.current !== pe || i !== pe) && (I.current = pe, E(oe));
  }), ke = De(() => A ?? N?.nodesRef.current.find((oe) => oe.id === G)?.context?.dataRef?.current.orientation), we = De(() => Fs(a, le.current)), Ce = De((oe) => {
    if (B.current = !1, ee.current = !0, oe.which === 229 || !se.current && oe.currentTarget === Z.current)
      return;
    if (d && SC(oe.key, R, b, D)) {
      Bs(oe.key, ke()) || ul(oe), j.setOpen(!1, Ge(Od, oe.nativeEvent)), Ct(q) && (v ? N?.events.emit("virtualfocus", q) : q.focus());
      return;
    }
    const pe = I.current, Ue = Fs(a, C), be = Ad(a, C);
    if (J || (oe.key === "Home" && (ul(oe), I.current = Ue, E(oe)), oe.key === "End" && (ul(oe), I.current = be, E(oe))), L != null) {
      const ve = L(oe, I.current, a, R, m, b, C, Ue, be);
      if (ve != null && (I.current = ve, E(oe)), R === "both")
        return;
    }
    if (Bs(oe.key, R)) {
      if (ul(oe), _ && !v && hn(oe.currentTarget.ownerDocument) === oe.currentTarget) {
        I.current = bd(oe.key, R, b) ? Ue : be, E(oe);
        return;
      }
      bd(oe.key, R, b) ? m ? pe >= be ? g && pe !== a.current.length ? I.current = -1 : (ee.current = !1, I.current = Ue) : I.current = Ul(a.current, {
        startingIndex: pe,
        disabledIndices: C
      }) : I.current = Math.min(be, Ul(a.current, {
        startingIndex: pe,
        disabledIndices: C
      })) : m ? pe <= Ue ? g && pe !== -1 ? I.current = a.current.length : (ee.current = !1, I.current = be) : I.current = Ul(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: C
      }) : I.current = Math.max(Ue, Ul(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: C
      })), ri(a.current, I.current) && (I.current = -1), E(oe);
    }
  }), he = y.useMemo(() => ({
    onFocus(pe) {
      ee.current = !0, He(pe);
    },
    onClick: ({
      currentTarget: pe
    }) => pe.focus({
      preventScroll: !0
    }),
    // Safari
    onMouseMove(pe) {
      ee.current = !0, ie.current = !1, T && He(pe);
    },
    onPointerLeave(pe) {
      if (!se.current || !B.current || pe.pointerType === "touch")
        return;
      ee.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!T || a.current.includes(Ue)) && _e.current && (ae.current?.(), ae.current = null, I.current = -1, E(pe), !v)) {
        const be = Z.current, ve = hn(et(be));
        be && Le(be, ve) && be.focus({
          preventScroll: !0
        });
      }
    }
  }), [He, se, Z, T, a, E, _e, v]), Se = y.useMemo(() => v && _ && Te && {
    "aria-activedescendant": `${O}-${i}`
  }, [v, _, Te, O, i]), Re = y.useMemo(() => ({
    "aria-orientation": R === "both" ? void 0 : R,
    ...J ? {} : Se,
    onKeyDown(oe) {
      if (oe.key === "Tab" && oe.shiftKey && _ && !v) {
        const pe = dn(oe.nativeEvent);
        if (pe && !Le(Z.current, pe))
          return;
        ul(oe), j.setOpen(!1, Ge(Wo, oe.nativeEvent)), Ct(q) && q.focus();
        return;
      }
      Ce(oe);
    },
    onPointerMove() {
      B.current = !0;
    }
  }), [Se, Ce, Z, R, J, j, _, v, q]), Oe = y.useMemo(() => {
    function oe(be) {
      j.setOpen(!0, Ge(Od, be.nativeEvent, be.currentTarget));
    }
    function pe(be) {
      x === "auto" && ep(be.nativeEvent) && (Y.current = !v);
    }
    function Ue(be) {
      Y.current = x, x === "auto" && Tv(be.nativeEvent) && (Y.current = !0);
    }
    return {
      onKeyDown(be) {
        const ve = j.select("open");
        B.current = !1;
        const We = be.key.startsWith("Arrow"), lt = xC(be.key, ke(), b), pt = Bs(be.key, R), zt = (d ? lt : pt) || be.key === "Enter" || be.key.trim() === "";
        if (v && ve)
          return Ce(be);
        if (!(!ve && !S && We)) {
          if (zt) {
            const $e = Bs(be.key, ke());
            K.current = d && $e ? null : be.key;
          }
          if (d) {
            lt && (ul(be), ve ? (I.current = we(), E(be)) : oe(be));
            return;
          }
          pt && (ge.current != null && (I.current = ge.current), ul(be), !ve && S ? oe(be) : Ce(be), ve && E(be));
        }
      },
      onFocus(be) {
        j.select("open") && !v && (I.current = -1, E(be));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, x, we, d, E, j, S, R, ke, b, ge, v]), je = y.useMemo(() => ({
    ...Se,
    ...Oe
  }), [Se, Oe]);
  return y.useMemo(() => f ? {
    reference: je,
    floating: Re,
    item: he,
    trigger: Oe
  } : {}, [f, je, Re, Oe, he]);
}
function O0(n, r) {
  const {
    listRef: a,
    elementsRef: i,
    activeIndex: c,
    onMatch: f,
    disabledIndices: p,
    onTyping: g,
    enabled: m = !0,
    resetMs: d = 750,
    selectedIndex: b = null
  } = r, v = "rootStore" in n ? n.rootStore : n, x = v.useState("open"), T = rn(), S = y.useRef(""), C = y.useRef(b ?? c ?? -1), R = y.useRef(null), A = De((M) => {
    function L(Z) {
      const G = i?.current[Z];
      return !G || Tu(G);
    }
    function D(Z) {
      return L(Z) ? p == null || !iu(Yl, Z, p) : !1;
    }
    function j(Z, G, N = 0) {
      if (Z.length === 0)
        return -1;
      const Y = (N % Z.length + Z.length) % Z.length, I = G.toLowerCase();
      for (let K = 0; K < Z.length; K += 1) {
        const B = (Y + K) % Z.length;
        if (!(!Z[B]?.toLowerCase().startsWith(I) || !D(B)))
          return B;
      }
      return -1;
    }
    const _ = a.current;
    if (S.current.length > 0 && M.key === " " && (ul(M), g?.(!0)), S.current.length > 0 && S.current[0] !== " " && j(_, S.current) === -1 && M.key !== " " && g?.(!1), _ == null || // Character key.
    M.key.length !== 1 || // Modifier key.
    M.ctrlKey || M.metaKey || M.altKey)
      return;
    x && M.key !== " " && (ul(M), g?.(!0));
    const X = S.current === "";
    X && (C.current = b ?? c ?? -1), _.every((Z, G) => Z && D(G) ? Z[0]?.toLowerCase() !== Z[1]?.toLowerCase() : !0) && S.current === M.key && (S.current = "", C.current = R.current), S.current += M.key, T.start(d, () => {
      S.current = "", C.current = R.current, g?.(!1);
    });
    const Q = ((X ? b ?? c ?? -1 : C.current) ?? 0) + 1, J = j(_, S.current, Q);
    J !== -1 ? (f?.(J), R.current = J) : M.key !== " " && (S.current = "", g?.(!1));
  }), O = De((M) => {
    const L = M.relatedTarget, D = v.select("domReferenceElement"), j = v.select("floatingElement");
    Le(D, L) || Le(j, L) || (T.clear(), S.current = "", C.current = R.current, g?.(!1));
  });
  xe(() => {
    !x && b !== null || (T.clear(), R.current = null, S.current !== "" && (S.current = ""));
  }, [x, b, T]), xe(() => {
    x && S.current === "" && (C.current = b ?? c ?? -1);
  }, [x, b, c]);
  const z = y.useMemo(() => ({
    onKeyDown: A,
    onBlur: O
  }), [A, O]);
  return y.useMemo(() => m ? {
    reference: z,
    floating: z
  } : {}, [m, z]);
}
const Db = 0.1, wC = Db * Db, wt = 0.5;
function Is(n, r, a, i, c, f) {
  return i >= r != f >= r && n <= (c - a) * (r - i) / (f - i) + a;
}
function Vs(n, r, a, i, c, f, p, g, m, d) {
  let b = !1;
  return Is(n, r, a, i, c, f) && (b = !b), Is(n, r, c, f, p, g) && (b = !b), Is(n, r, p, g, m, d) && (b = !b), Is(n, r, m, d, a, i) && (b = !b), b;
}
function EC(n, r, a) {
  return n >= a.x && n <= a.x + a.width && r >= a.y && r <= a.y + a.height;
}
function Ys(n, r, a, i, c, f) {
  const p = Math.min(a, c), g = Math.max(a, c), m = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= g && r >= m && r <= d;
}
function Tp(n = {}) {
  const {
    blockPointerEvents: r = !1
  } = n, a = new nl(), i = ({
    x: c,
    y: f,
    placement: p,
    elements: g,
    onClose: m,
    nodeId: d,
    tree: b
  }) => {
    const v = p?.split("-")[0];
    let x = !1, T = null, S = null, C = typeof performance < "u" ? performance.now() : 0;
    function R(O, z) {
      const M = performance.now(), L = M - C;
      if (T === null || S === null || L === 0)
        return T = O, S = z, C = M, !1;
      const D = O - T, j = z - S, _ = D * D + j * j, X = L * L * wC;
      return T = O, S = z, C = M, _ < X;
    }
    function A() {
      a.clear(), m();
    }
    return function(z) {
      a.clear();
      const M = g.domReference, L = g.floating;
      if (!M || !L || v == null || c == null || f == null)
        return;
      const {
        clientX: D,
        clientY: j
      } = z, _ = dn(z), X = z.type === "mouseleave", q = Le(L, _), re = Le(M, _);
      if (q && (x = !0, !X))
        return;
      if (re && (x = !1, !X)) {
        x = !0;
        return;
      }
      if (X && Je(z.relatedTarget) && Le(L, z.relatedTarget))
        return;
      function Q() {
        return !!(b && So(b.nodesRef.current, d).length > 0);
      }
      function J() {
        Q() || A();
      }
      if (Q())
        return;
      const Z = M.getBoundingClientRect(), G = L.getBoundingClientRect(), N = c > G.right - G.width / 2, Y = f > G.bottom - G.height / 2, I = G.width > Z.width, K = G.height > Z.height, B = (I ? Z : G).left, E = (I ? Z : G).right, H = (K ? Z : G).top, te = (K ? Z : G).bottom;
      if (v === "top" && f >= Z.bottom - 1 || v === "bottom" && f <= Z.top + 1 || v === "left" && c >= Z.right - 1 || v === "right" && c <= Z.left + 1) {
        J();
        return;
      }
      let ee = !1;
      switch (v) {
        case "top":
          ee = Ys(D, j, B, Z.top + 1, E, G.bottom - 1);
          break;
        case "bottom":
          ee = Ys(D, j, B, G.top + 1, E, Z.bottom - 1);
          break;
        case "left":
          ee = Ys(D, j, G.right - 1, te, Z.left + 1, H);
          break;
        case "right":
          ee = Ys(D, j, Z.right - 1, te, G.left + 1, H);
          break;
      }
      if (ee)
        return;
      if (x && !EC(D, j, Z)) {
        J();
        return;
      }
      if (!X && R(D, j)) {
        J();
        return;
      }
      let ie = !1;
      switch (v) {
        case "top": {
          const ae = I ? wt / 2 : wt * 4, le = I || N ? c + ae : c - ae, se = I ? c - ae : N ? c + ae : c - ae, ge = f + wt + 1, _e = N || I ? G.bottom - wt : G.top, Ee = N ? I ? G.bottom - wt : G.top : G.bottom - wt;
          ie = Vs(D, j, le, ge, se, ge, G.left, _e, G.right, Ee);
          break;
        }
        case "bottom": {
          const ae = I ? wt / 2 : wt * 4, le = I || N ? c + ae : c - ae, se = I ? c - ae : N ? c + ae : c - ae, ge = f - wt, _e = N || I ? G.top + wt : G.bottom, Ee = N ? I ? G.top + wt : G.bottom : G.top + wt;
          ie = Vs(D, j, le, ge, se, ge, G.left, _e, G.right, Ee);
          break;
        }
        case "left": {
          const ae = K ? wt / 2 : wt * 4, le = K || Y ? f + ae : f - ae, se = K ? f - ae : Y ? f + ae : f - ae, ge = c + wt + 1, _e = Y || K ? G.right - wt : G.left, Ee = Y ? K ? G.right - wt : G.left : G.right - wt;
          ie = Vs(D, j, _e, G.top, Ee, G.bottom, ge, le, ge, se);
          break;
        }
        case "right": {
          const ae = K ? wt / 2 : wt * 4, le = K || Y ? f + ae : f - ae, se = K ? f - ae : Y ? f + ae : f - ae, ge = c - wt, _e = Y || K ? G.left + wt : G.right, Ee = Y ? K ? G.left + wt : G.right : G.left + wt;
          ie = Vs(D, j, ge, le, ge, se, _e, G.top, Ee, G.bottom);
          break;
        }
      }
      ie ? x || a.start(40, J) : J();
    };
  };
  return i.__options = {
    ...n,
    blockPointerEvents: r
  }, i;
}
function RC(n) {
  const {
    store: r,
    actionsRef: a
  } = n, i = r.useState("open");
  gC(r, i), hp(r);
  const {
    forceUnmount: c
  } = yp(i, r), f = y.useCallback(() => {
    r.setOpen(!1, Ge(np));
  }, [r]);
  y.useImperativeHandle(a, () => ({
    unmount: c,
    close: f
  }), [c, f]);
}
function TC({
  store: n,
  parentContext: r,
  isDrawer: a
}) {
  const i = n.useState("open"), c = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = y.useState(0), [b, v] = y.useState(0), x = m === 0, T = Cu(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(A) {
      if (!n.context.outsidePressEnabledRef.current || "button" in A && A.button !== 0 || "touches" in A && A.touches.length !== 1)
        return !1;
      const O = dn(A);
      return x && !c ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === O || n.context.backdropRef.current === O || Le(O, p) && !O?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: x
  });
  Rv(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (A, O) => {
    d(A), v(O);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), v(0);
  }), y.useEffect(() => (r?.onNestedDialogOpen && i && r.onNestedDialogOpen(m + 1, b + (a ? 1 : 0)), r?.onNestedDialogClose && !i && r.onNestedDialogClose(), () => {
    r?.onNestedDialogClose && i && r.onNestedDialogClose();
  }), [a, i, m, b, r]);
  const S = T.reference ?? Ot, C = T.trigger ?? Ot, R = T.floating ?? Ot;
  return bp(n, {
    activeTriggerProps: S,
    inactiveTriggerProps: C,
    popupProps: R,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: b
  }), null;
}
const M0 = /* @__PURE__ */ y.createContext(!1), A0 = /* @__PURE__ */ y.createContext(void 0);
function ar(n) {
  const r = y.useContext(A0);
  if (n === !1 && r === void 0)
    throw new Error(Lt(27));
  return r;
}
const CC = {
  ...Sp,
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
class Cp extends Mu {
  constructor(r, a, i = !1) {
    const c = new yi(), f = OC(r);
    f.floatingRootContext = x0(c, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      outsidePressEnabledRef: {
        current: !0
      },
      triggerElements: c,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, CC);
  }
  setOpen = (r, a) => {
    if (a.preventUnmountOnClose = () => {
      this.set("preventUnmountingOnClose", !0);
    }, !r && a.trigger == null && this.state.activeTriggerId != null && (a.trigger = this.state.activeTriggerElement ?? void 0), this.context.onOpenChange?.(r, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(r, a);
    const i = {
      open: r
    };
    mp(i, r, a.trigger), this.update(i);
  };
  static useStore(r, a) {
    return m0(r, (c, f) => new Cp(a, c, f), !0).store;
  }
}
function OC(n = {}) {
  return {
    ...vp(),
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
function z0(n, r = "dialog") {
  const {
    children: a,
    open: i,
    defaultOpen: c = !1,
    onOpenChange: f,
    onOpenChangeComplete: p,
    disablePointerDismissal: g = !1,
    modal: m = !0,
    actionsRef: d,
    handle: b,
    triggerId: v,
    defaultTriggerId: x = null
  } = n, T = r === "drawer", S = r === "alert-dialog", C = S ? !0 : m, R = S || g, A = S ? "alertdialog" : "dialog", O = ar(!0), M = {
    modal: C,
    disablePointerDismissal: R,
    nested: !!O,
    role: A
  }, L = Cp.useStore(b?.store, {
    open: c,
    openProp: i,
    activeTriggerId: x,
    triggerIdProp: v,
    ...M
  });
  Fd(() => {
    const re = i === void 0 && L.state.open === !1 && c === !0 ? {
      open: !0,
      activeTriggerId: x
    } : null;
    S ? L.update(re ? {
      ...M,
      ...re
    } : M) : re && L.update(re);
  }), L.useControlledProp("openProp", i), L.useControlledProp("triggerIdProp", v), L.useSyncedValues(M), L.useContextCallback("onOpenChange", f), L.useContextCallback("onOpenChangeComplete", p);
  const D = L.useState("open"), j = L.useState("mounted"), _ = L.useState("payload");
  RC({
    store: L,
    actionsRef: d
  });
  const X = D || j, q = y.useMemo(() => ({
    store: L
  }), [L]);
  return /* @__PURE__ */ k.jsx(M0.Provider, {
    value: !1,
    children: /* @__PURE__ */ k.jsxs(A0.Provider, {
      value: q,
      children: [X && /* @__PURE__ */ k.jsx(TC, {
        store: L,
        parentContext: O?.store.context,
        isDrawer: T
      }), typeof a == "function" ? a({
        payload: _
      }) : a]
    })
  });
}
function MC(n) {
  return z0(n, "alert-dialog");
}
let Fo = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = gi.startingStyle] = "startingStyle", n[n.endingStyle = gi.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), fu = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const AC = {
  [fu.popupOpen]: ""
}, zC = {
  [fu.popupOpen]: "",
  [fu.pressed]: ""
}, DC = {
  [Fo.open]: ""
}, NC = {
  [Fo.closed]: ""
}, _C = {
  [Fo.anchorHidden]: ""
}, Op = {
  open(n) {
    return n ? AC : null;
  }
}, kd = {
  open(n) {
    return n ? zC : null;
  }
}, ir = {
  open(n) {
    return n ? DC : NC;
  },
  anchorHidden(n) {
    return n ? _C : null;
  }
}, kC = {
  ...ir,
  ...rr
}, D0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    forceRender: p = !1,
    ...g
  } = r, {
    store: m
  } = ar(), d = m.useState("open"), b = m.useState("nested"), v = m.useState("mounted"), x = m.useState("transitionStatus");
  return it("div", r, {
    state: {
      open: d,
      transitionStatus: x
    },
    ref: [m.context.backdropRef, a],
    stateAttributesMapping: kC,
    props: [{
      role: "presentation",
      hidden: !v,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, g],
    enabled: p || !b
  });
}), N0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    ...m
  } = r, {
    store: d
  } = ar(), b = d.useState("open"), {
    getButtonProps: v,
    buttonRef: x
  } = lr({
    disabled: p,
    native: g
  }), T = {
    disabled: p
  };
  function S(C) {
    b && d.setOpen(!1, Ge(SR, C.nativeEvent));
  }
  return it("button", r, {
    state: T,
    ref: [a, x],
    props: [{
      onClick: S
    }, m, v]
  });
});
function dl(n) {
  return $o(n, "base-ui");
}
const _0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = r, {
    store: m
  } = ar(), d = dl(p);
  return m.useSyncedValueWithCleanup("descriptionElementId", d), it("p", r, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
let HC = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), jC = (function(n) {
  return n[n.open = Fo.open] = "open", n[n.closed = Fo.closed] = "closed", n[n.startingStyle = Fo.startingStyle] = "startingStyle", n[n.endingStyle = Fo.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const k0 = /* @__PURE__ */ y.createContext(void 0);
function UC() {
  const n = y.useContext(k0);
  if (n === void 0)
    throw new Error(Lt(26));
  return n;
}
const ii = "ArrowUp", si = "ArrowDown", du = "ArrowLeft", pu = "ArrowRight", _u = "Home", ku = "End", H0 = /* @__PURE__ */ new Set([du, pu]), LC = /* @__PURE__ */ new Set([du, pu, _u, ku]), j0 = /* @__PURE__ */ new Set([ii, si]), BC = /* @__PURE__ */ new Set([ii, si, _u, ku]), U0 = /* @__PURE__ */ new Set([...H0, ...j0]), Hu = /* @__PURE__ */ new Set([...U0, _u, ku]), IC = "Shift", VC = "Control", YC = "Alt", GC = "Meta", qC = /* @__PURE__ */ new Set([IC, VC, YC, GC]);
function PC(n) {
  return Ct(n) && n.tagName === "INPUT";
}
function Nb(n) {
  return !!(PC(n) && n.selectionStart != null || Ct(n) && n.tagName === "TEXTAREA");
}
function _b(n, r, a, i) {
  if (!n || !r || !r.scrollTo)
    return;
  let c = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = kb(n, r, "left"), d = Gs(n), b = Gs(r);
    a === "ltr" && (m + r.offsetWidth + b.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? c = m + r.offsetWidth + b.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - b.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (c = m - b.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - b.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? c = m - b.scrollMarginLeft - d.scrollPaddingLeft : m + r.offsetWidth + b.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (c = m + r.offsetWidth + b.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = kb(n, r, "top"), d = Gs(n), b = Gs(r);
    m - b.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - b.scrollMarginTop - d.scrollPaddingTop : m + r.offsetHeight + b.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + r.offsetHeight + b.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: c,
    top: f,
    behavior: "auto"
  });
}
function kb(n, r, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let c = 0;
  for (; r.offsetParent && (c += r[i], r.offsetParent !== n); )
    r = r.offsetParent;
  return c;
}
function Gs(n) {
  const r = getComputedStyle(n);
  return {
    scrollMarginTop: parseFloat(r.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(r.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(r.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(r.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(r.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(r.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(r.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(r.scrollPaddingLeft) || 0
  };
}
const XC = {
  ...ir,
  ...rr,
  nestedDialogOpen(n) {
    return n ? {
      [jC.nestedDialogOpen]: ""
    } : null;
  }
}, L0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    finalFocus: p,
    initialFocus: g,
    ...m
  } = r, {
    store: d
  } = ar(), b = d.useState("descriptionElementId"), v = d.useState("disablePointerDismissal"), x = d.useState("floatingRootContext"), T = d.useState("popupProps"), S = d.useState("modal"), C = d.useState("mounted"), R = d.useState("nested"), A = d.useState("nestedOpenDialogCount"), O = d.useState("open"), z = d.useState("openMethod"), M = d.useState("titleElementId"), L = d.useState("transitionStatus"), D = d.useState("role"), j = x.useState("floatingId"), _ = m.id ?? j;
  UC(), Mo({
    open: O,
    ref: d.context.popupRef,
    onComplete() {
      O && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const X = g === void 0 ? dC(d.context.popupRef) : g, q = A > 0, re = d.useStateSetter("popupElement"), J = it("div", r, {
    state: {
      open: O,
      nested: R,
      transitionStatus: L,
      nestedDialogOpen: q
    },
    props: [T, {
      id: _,
      "aria-labelledby": M ?? void 0,
      "aria-describedby": b ?? void 0,
      role: D,
      ...Du,
      hidden: !C,
      onKeyDown(Z) {
        Hu.has(Z.key) && Z.stopPropagation();
      },
      style: {
        [HC.nestedDialogs]: A
      }
    }, m],
    ref: [a, d.context.popupRef, re],
    stateAttributesMapping: XC
  });
  return /* @__PURE__ */ k.jsx(fp, {
    context: x,
    openInteractionType: z,
    disabled: !C,
    closeOnFocusOut: !v,
    initialFocus: X,
    returnFocus: p,
    modal: S !== !1,
    restoreFocus: "popup",
    children: J
  });
});
function Mp(n) {
  return Xd(19) ? n : n ? "true" : void 0;
}
const Ap = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    cutout: i,
    ...c
  } = r;
  let f;
  if (i) {
    const p = i.getBoundingClientRect();
    f = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${p.left}px ${p.top}px,${p.left}px ${p.bottom}px,${p.right}px ${p.bottom}px,${p.right}px ${p.top}px,${p.left}px ${p.top}px)`;
  }
  return /* @__PURE__ */ k.jsx("div", {
    ref: a,
    role: "presentation",
    "data-base-ui-inert": "",
    ...c,
    style: {
      position: "fixed",
      inset: 0,
      userSelect: "none",
      WebkitUserSelect: "none",
      clipPath: f
    }
  });
}), B0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = r, {
    store: f
  } = ar(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ k.jsx(k0.Provider, {
    value: i,
    children: /* @__PURE__ */ k.jsxs(sp, {
      ref: a,
      ...c,
      children: [p && g === !0 && /* @__PURE__ */ k.jsx(Ap, {
        ref: f.context.internalBackdropRef,
        inert: Mp(!m)
      }), r.children]
    })
  }) : null;
}), I0 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = r, {
    store: m
  } = ar(), d = dl(p);
  return m.useSyncedValueWithCleanup("titleElementId", d), it("h2", r, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
function KC(n) {
  const r = y.useRef(""), a = y.useCallback((c) => {
    c.defaultPrevented || (r.current = c.pointerType, n(c, c.pointerType));
  }, [n]);
  return {
    onClick: y.useCallback((c) => {
      if (c.detail === 0) {
        n(c, "keyboard");
        return;
      }
      "pointerType" in c ? n(c, c.pointerType) : n(c, r.current), r.current = "";
    }, [n]),
    onPointerDown: a
  };
}
function V0(n, r) {
  const a = y.useRef(n), i = De(r);
  xe(() => {
    a.current !== n && i(a.current);
  }, [n, i]), xe(() => {
    a.current = n;
  }, [n]);
}
function QC(n, r) {
  const a = De((f, p) => {
    (typeof n == "function" ? n() : n) || r(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (vu ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: c
  } = KC(a);
  return y.useMemo(() => ({
    onClick: i,
    onPointerDown: c
  }), [i, c]);
}
function Y0(n) {
  const [r, a] = y.useState(null), i = QC(n, a);
  return V0(n, (c) => {
    c && !n && a(null);
  }), y.useMemo(() => ({
    openMethod: r,
    triggerProps: i
  }), [r, i]);
}
function ZC({ ...n }) {
  return /* @__PURE__ */ k.jsx(MC, { "data-slot": "alert-dialog", ...n });
}
function FC({ ...n }) {
  return /* @__PURE__ */ k.jsx(B0, { "data-slot": "alert-dialog-portal", ...n });
}
function JC({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    D0,
    {
      "data-slot": "alert-dialog-overlay",
      className: st(
        "tw:fixed tw:inset-0 tw:isolate tw:z-[var(--z-modal)] tw:bg-black/10 tw:duration-[var(--motion-fast)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...r
    }
  );
}
function WC({
  className: n,
  size: r = "default",
  ...a
}) {
  return /* @__PURE__ */ k.jsxs(FC, { children: [
    /* @__PURE__ */ k.jsx(JC, {}),
    /* @__PURE__ */ k.jsx(
      L0,
      {
        "data-slot": "alert-dialog-content",
        "data-size": r,
        className: st(
          "tw:group/alert-dialog-content tw:fixed tw:top-1/2 tw:left-1/2 tw:z-[var(--z-modal)] tw:grid tw:w-full tw:-translate-x-1/2 tw:-translate-y-1/2 tw:gap-4 tw:rounded-[var(--radius-surface)] tw:bg-popover tw:p-4 tw:text-popover-foreground tw:ring-1 tw:ring-foreground/10 tw:duration-[var(--motion-fast)] tw:outline-none tw:data-[size=default]:max-w-xs tw:data-[size=sm]:max-w-xs tw:data-[size=default]:sm:max-w-sm",
          n
        ),
        ...a
      }
    )
  ] });
}
function $C({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: st(
        "tw:grid tw:grid-rows-[auto_1fr] tw:place-items-center tw:gap-1.5 tw:text-center tw:sm:group-data-[size=default]/alert-dialog-content:place-items-start tw:sm:group-data-[size=default]/alert-dialog-content:text-left",
        n
      ),
      ...r
    }
  );
}
function eO({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: st(
        "tw:-mx-4 tw:-mb-4 tw:flex tw:flex-col-reverse tw:gap-2 tw:rounded-b-[var(--radius-surface)] tw:border-t tw:bg-muted/50 tw:p-4 tw:sm:flex-row tw:sm:justify-end",
        n
      ),
      ...r
    }
  );
}
function tO({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    I0,
    {
      "data-slot": "alert-dialog-title",
      className: st(
        "tw:text-[var(--fs-title)] tw:font-medium tw:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        n
      ),
      ...r
    }
  );
}
function nO({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    _0,
    {
      "data-slot": "alert-dialog-description",
      className: st(
        "tw:text-[var(--fs-body-s)] tw:text-balance tw:text-muted-foreground tw:md:text-pretty tw:*:[a]:underline tw:*:[a]:underline-offset-3 tw:*:[a]:hover:text-foreground",
        n
      ),
      ...r
    }
  );
}
function lO({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    Zo,
    {
      "data-slot": "alert-dialog-action",
      className: st(n),
      ...r
    }
  );
}
function oO({
  className: n,
  variant: r = "outline",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ k.jsx(
    N0,
    {
      "data-slot": "alert-dialog-cancel",
      className: st(n),
      render: /* @__PURE__ */ k.jsx(Zo, { variant: r, size: a }),
      ...i
    }
  );
}
const G0 = /* @__PURE__ */ y.createContext(void 0);
function ju(n) {
  const r = y.useContext(G0);
  if (r === void 0 && !n)
    throw new Error(Lt(33));
  return r;
}
const q0 = /* @__PURE__ */ y.createContext(void 0);
function pl(n) {
  const r = y.useContext(q0);
  if (r === void 0 && !n)
    throw new Error(Lt(36));
  return r;
}
const rO = /* @__PURE__ */ y.createContext(void 0);
function Uu(n = !0) {
  const r = y.useContext(rO);
  if (r === void 0 && !n)
    throw new Error(Lt(25));
  return r;
}
function ta({
  controlled: n,
  default: r,
  name: a,
  state: i = "value"
}) {
  const {
    current: c
  } = y.useRef(n !== void 0), [f, p] = y.useState(r), g = c ? n : f, m = y.useCallback((d) => {
    c || p(d);
  }, []);
  return [g, m];
}
const P0 = /* @__PURE__ */ y.createContext(void 0);
function aO() {
  const n = y.useContext(P0);
  if (n === void 0)
    throw new Error(Lt(30));
  return n;
}
function iO(n) {
  const {
    closeOnClick: r,
    highlighted: a,
    id: i,
    nodeId: c,
    store: f,
    typingRef: p,
    itemRef: g,
    itemMetadata: m
  } = n, {
    events: d
  } = f.useState("floatingTreeRoot"), b = f.useState("open"), v = Uu(!0), x = v !== void 0;
  return y.useMemo(() => ({
    id: i,
    role: "menuitem",
    tabIndex: b && a ? 0 : -1,
    onKeyDown(T) {
      T.key === " " && p?.current && T.preventDefault();
    },
    onMouseMove(T) {
      c && d.emit("itemhover", {
        nodeId: c,
        target: T.currentTarget
      });
    },
    onClick(T) {
      r && d.emit("close", {
        domEvent: T,
        reason: Kr
      });
    },
    onMouseUp(T) {
      if (v) {
        const S = v.initialCursorPointRef.current;
        if (v.initialCursorPointRef.current = null, x && S && Math.abs(T.clientX - S.x) <= 1 && Math.abs(T.clientY - S.y) <= 1 || x && !Jd && T.button === 2)
          return;
      }
      g.current && f.context.allowMouseUpTriggerRef.current && (!x || T.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [r, a, i, d, c, b, f, p, g, v, x, m]);
}
const X0 = {
  type: "regular-item"
};
function zp(n) {
  const {
    closeOnClick: r,
    disabled: a = !1,
    highlighted: i,
    id: c,
    store: f,
    typingRef: p = f.context.typingRef,
    nativeButton: g,
    itemMetadata: m,
    nodeId: d
  } = n, b = f.useState("disabled"), v = a || b, x = y.useRef(null), {
    getButtonProps: T,
    buttonRef: S
  } = lr({
    disabled: v,
    focusableWhenDisabled: !0,
    native: g,
    composite: !0
  }), C = iO({
    closeOnClick: r,
    highlighted: i,
    id: c,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: x,
    itemMetadata: m
  }), R = y.useCallback((O) => Tn(C, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, O, T), [C, T, m]), A = xo(x, S);
  return y.useMemo(() => ({
    getItemProps: R,
    itemRef: A
  }), [R, A]);
}
const K0 = /* @__PURE__ */ y.createContext({
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
function sO() {
  return y.useContext(K0);
}
let Q0 = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function bi(n = {}) {
  const {
    label: r,
    metadata: a,
    textRef: i,
    indexGuessBehavior: c,
    index: f
  } = n, {
    register: p,
    unregister: g,
    subscribeMapChange: m,
    elementsRef: d,
    labelsRef: b,
    nextIndexRef: v
  } = sO(), x = y.useRef(-1), [T, S] = y.useState(f ?? (c === Q0.GuessFromOrder ? () => {
    if (x.current === -1) {
      const A = v.current;
      v.current += 1, x.current = A;
    }
    return x.current;
  } : -1)), C = y.useRef(null), R = y.useCallback((A) => {
    if (C.current = A, T !== -1 && A !== null && (d.current[T] = A, b)) {
      const O = r !== void 0;
      b.current[T] = O ? r : i?.current?.textContent ?? A.textContent;
    }
  }, [T, d, b, r, i]);
  return xe(() => {
    if (f != null)
      return;
    const A = C.current;
    if (A)
      return p(A, a), () => {
        g(A);
      };
  }, [f, p, g, a]), xe(() => {
    if (f == null)
      return m((A) => {
        const O = C.current ? A.get(C.current)?.index : null;
        O != null && S(O);
      });
  }, [f, m, S]), {
    ref: R,
    index: T
  };
}
let Hb = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const Z0 = {
  checked(n) {
    return n ? {
      [Hb.checked]: ""
    } : {
      [Hb.unchecked]: ""
    };
  },
  ...rr
}, uO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !1,
    checked: b,
    defaultChecked: v,
    onCheckedChange: x,
    style: T,
    ...S
  } = r, C = bi({
    label: p
  }), R = ju(!0), A = dl(f), {
    store: O
  } = pl(), z = O.useState("isActive", C.index), M = O.useState("itemProps"), [L, D] = ta({
    controlled: b,
    default: v ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: j,
    itemRef: _
  } = zp({
    closeOnClick: d,
    disabled: m,
    highlighted: z,
    id: A,
    store: O,
    nativeButton: g,
    nodeId: R?.context.nodeId,
    itemMetadata: X0
  }), X = y.useMemo(() => ({
    disabled: m,
    highlighted: z,
    checked: L
  }), [m, z, L]);
  function q(Q) {
    const J = Ge(Kr, Q.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    x?.(!L, J), !J.isCanceled && D((Z) => !Z);
  }
  const re = it("div", r, {
    state: X,
    stateAttributesMapping: Z0,
    props: [M, {
      role: "menuitemcheckbox",
      "aria-checked": L,
      onClick: q
    }, S, j],
    ref: [_, a, C.ref]
  });
  return /* @__PURE__ */ k.jsx(P0.Provider, {
    value: X,
    children: re
  });
}), cO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    keepMounted: p = !1,
    ...g
  } = r, m = aO(), d = y.useRef(null), {
    transitionStatus: b,
    setMounted: v
  } = zu(m.checked);
  Mo({
    open: m.checked,
    ref: d,
    onComplete() {
      m.checked || v(!1);
    }
  });
  const x = {
    checked: m.checked,
    disabled: m.disabled,
    highlighted: m.highlighted,
    transitionStatus: b
  };
  return it("span", r, {
    state: x,
    ref: [a, d],
    stateAttributesMapping: Z0,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
  });
}), F0 = /* @__PURE__ */ y.createContext(void 0);
function fO() {
  const n = y.useContext(F0);
  if (n === void 0)
    throw new Error(Lt(31));
  return n;
}
const dO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, [g, m] = y.useState(void 0), d = it("div", r, {
    ref: a,
    props: {
      role: "group",
      "aria-labelledby": g,
      ...p
    }
  });
  return /* @__PURE__ */ k.jsx(F0.Provider, {
    value: m,
    children: d
  });
}), pO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = r, m = dl(p), d = fO();
  return xe(() => (d(m), () => {
    d(void 0);
  }), [d, m]), it("div", r, {
    ref: a,
    props: {
      id: m,
      role: "presentation",
      ...g
    }
  });
}), gO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !0,
    style: b,
    ...v
  } = r, x = bi({
    label: p
  }), T = ju(!0), S = dl(f), {
    store: C
  } = pl(), R = C.useState("isActive", x.index), A = C.useState("itemProps"), {
    getItemProps: O,
    itemRef: z
  } = zp({
    closeOnClick: d,
    disabled: m,
    highlighted: R,
    id: S,
    store: C,
    nativeButton: g,
    nodeId: T?.context.nodeId,
    itemMetadata: X0
  });
  return it("div", r, {
    state: {
      disabled: m,
      highlighted: R
    },
    props: [A, v, O],
    ref: [z, a, x.ref]
  });
}), mO = /* @__PURE__ */ y.createContext(void 0);
function Dp(n) {
  return y.useContext(mO);
}
function Lu(n) {
  return n === "starting" ? WR : Ot;
}
const hO = {
  ...ir,
  ...rr
}, yO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    finalFocus: p,
    ...g
  } = r, {
    store: m
  } = pl(), {
    side: d,
    align: b
  } = ju(), v = Dp() != null, x = m.useState("open"), T = m.useState("transitionStatus"), S = m.useState("popupProps"), C = m.useState("mounted"), R = m.useState("instantType"), A = m.useState("activeTriggerElement"), O = m.useState("parent"), z = m.useState("lastOpenChangeReason"), M = m.useState("rootId"), L = m.useState("floatingRootContext"), D = m.useState("floatingTreeRoot"), j = m.useState("closeDelay"), _ = m.useState("activeTriggerElement"), X = m.useState("hoverEnabled"), q = m.useState("disabled"), re = m.useState("openMethod"), Q = O.type === "context-menu";
  Mo({
    open: x,
    ref: m.context.popupRef,
    onComplete() {
      x && m.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function Y(I) {
      m.setOpen(!1, Ge(I.reason, I.domEvent));
    }
    return D.events.on("close", Y), () => {
      D.events.off("close", Y);
    };
  }, [D.events, m]), T0(L, {
    enabled: X && !q && !Q && O.type !== "menubar",
    closeDelay: j
  });
  const J = y.useCallback((Y) => {
    m.set("popupElement", Y);
  }, [m]), Z = {
    transitionStatus: T,
    side: d,
    align: b,
    open: x,
    nested: O.type === "menu",
    instant: R
  }, G = it("div", r, {
    state: Z,
    ref: [a, m.context.popupRef, J],
    stateAttributesMapping: hO,
    props: [S, {
      onKeyDown(Y) {
        v && Hu.has(Y.key) && Y.stopPropagation();
      }
    }, Lu(T), g, {
      "data-rootownerid": M
    }]
  });
  let N = O.type === void 0 || Q;
  return (A || O.type === "menubar" && z !== Eu) && (N = !0), /* @__PURE__ */ k.jsx(fp, {
    context: L,
    openInteractionType: re,
    modal: Q,
    disabled: !C,
    returnFocus: p === void 0 ? N : p,
    initialFocus: O.type !== "menu",
    restoreFocus: !0,
    externalTree: O.type !== "menubar" ? D : void 0,
    previousFocusableElement: _,
    nextFocusableElement: O.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: O.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
    children: G
  });
}), J0 = /* @__PURE__ */ y.createContext(void 0);
function bO() {
  const n = y.useContext(J0);
  if (n === void 0)
    throw new Error(Lt(32));
  return n;
}
const vO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = r, {
    store: f
  } = pl();
  return f.useState("mounted") || i ? /* @__PURE__ */ k.jsx(J0.Provider, {
    value: i,
    children: /* @__PURE__ */ k.jsx(sp, {
      ref: a,
      ...c
    })
  }) : null;
}), xO = /* @__PURE__ */ y.createContext(void 0);
function Bu() {
  return y.useContext(xO)?.direction ?? "ltr";
}
const SO = (n) => ({
  name: "arrow",
  options: n,
  async fn(r) {
    const {
      x: a,
      y: i,
      placement: c,
      rects: f,
      platform: p,
      elements: g,
      middlewareData: m
    } = r, {
      element: d,
      padding: b = 0,
      offsetParent: v = "real"
    } = Gl(n, r) || {};
    if (d == null)
      return {};
    const x = kv(b), T = {
      x: a,
      y: i
    }, S = rp(c), C = op(S), R = await p.getDimensions(d), A = S === "y", O = A ? "top" : "left", z = A ? "bottom" : "right", M = A ? "clientHeight" : "clientWidth", L = f.reference[C] + f.reference[S] - T[S] - f.floating[C], D = T[S] - f.reference[S], j = v === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let _ = g.floating[M] || f.floating[C];
    (!_ || !await p.isElement?.(j)) && (_ = g.floating[M] || f.floating[C]);
    const X = L / 2 - D / 2, q = _ / 2 - R[C] / 2 - 1, re = Math.min(x[O], q), Q = Math.min(x[z], q), J = re, Z = _ - R[C] - Q, G = _ / 2 - R[C] / 2 + X, N = _v(J, G, Z), Y = !m.arrow && To(c) != null && G !== N && f.reference[C] / 2 - (G < J ? re : Q) - R[C] / 2 < 0, I = Y ? G < J ? G - J : G - Z : 0;
    return {
      [S]: T[S] + I,
      data: {
        [S]: N,
        centerOffset: G - N - I,
        ...Y && {
          alignmentOffset: I
        }
      },
      reset: Y
    };
  }
}), wO = (n, r) => ({
  ...SO(n),
  options: [n, r]
}), EO = FT().fn, RO = {
  name: "hide",
  async fn(n) {
    const {
      width: r,
      height: a,
      x: i,
      y: c
    } = n.rects.reference, f = r === 0 && a === 0 && i === 0 && c === 0;
    return {
      data: {
        referenceHidden: (await EO(n)).data?.referenceHidden || f
      }
    };
  }
}, $s = {
  sideX: "left",
  sideY: "top"
}, W0 = {
  name: "adaptiveOrigin",
  async fn(n) {
    const {
      x: r,
      y: a,
      rects: {
        floating: i
      },
      elements: {
        floating: c
      },
      platform: f,
      strategy: p,
      placement: g
    } = n, m = At(c), d = m.getComputedStyle(c);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: r,
        y: a,
        data: $s
      };
    const v = await f.getOffsetParent?.(c);
    let x = {
      width: 0,
      height: 0
    };
    if (p === "fixed" && m?.visualViewport)
      x = {
        width: m.visualViewport.width,
        height: m.visualViewport.height
      };
    else if (v === m) {
      const O = et(c);
      x = {
        width: O.documentElement.clientWidth,
        height: O.documentElement.clientHeight
      };
    } else await f.isElement?.(v) && (x = await f.getDimensions(v));
    const T = Un(g);
    let S = r, C = a;
    T === "left" && (S = x.width - (r + i.width)), T === "top" && (C = x.height - (a + i.height));
    const R = T === "left" ? "right" : $s.sideX, A = T === "top" ? "bottom" : $s.sideY;
    return {
      x: S,
      y: C,
      data: {
        sideX: R,
        sideY: A
      }
    };
  }
};
function $0(n, r, a) {
  const i = n === "inline-start" || n === "inline-end";
  return {
    top: "top",
    right: i ? a ? "inline-start" : "inline-end" : "right",
    bottom: "bottom",
    left: i ? a ? "inline-end" : "inline-start" : "left"
  }[r];
}
function jb(n, r, a) {
  const {
    rects: i,
    placement: c
  } = n;
  return {
    side: $0(r, Un(c), a),
    align: To(c) || "center",
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
function Np(n) {
  const {
    // Public parameters
    anchor: r,
    positionMethod: a = "absolute",
    side: i = "bottom",
    sideOffset: c = 0,
    align: f = "center",
    alignOffset: p = 0,
    collisionBoundary: g,
    collisionPadding: m = 5,
    sticky: d = !1,
    arrowPadding: b = 5,
    disableAnchorTracking: v = !1,
    inline: x,
    // Private parameters
    keepMounted: T = !1,
    floatingRootContext: S,
    mounted: C,
    collisionAvoidance: R,
    shiftCrossAxis: A = !1,
    nodeId: O,
    adaptiveOrigin: z,
    lazyFlip: M = !1,
    externalTree: L
  } = n, [D, j] = y.useState(null);
  !C && D !== null && j(null);
  const _ = R.side || "flip", X = R.align || "flip", q = R.fallbackAxisSide || "end", re = typeof r == "function" ? r : void 0, Q = De(re), J = re ? Q : r, Z = Vt(r), G = Vt(C), Y = Bu() === "rtl", I = D || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": Y ? "left" : "right",
    "inline-start": Y ? "right" : "left"
  }[i], K = f === "center" ? I : `${I}-${f}`;
  let B = m;
  const E = 1, H = i === "bottom" ? E : 0, te = i === "top" ? E : 0, ee = i === "right" ? E : 0, ie = i === "left" ? E : 0;
  typeof B == "number" ? B = {
    top: B + H,
    right: B + ie,
    bottom: B + te,
    left: B + ee
  } : B && (B = {
    top: (B.top || 0) + H,
    right: (B.right || 0) + ie,
    bottom: (B.bottom || 0) + te,
    left: (B.left || 0) + ee
  });
  const ae = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: B
  }, le = y.useRef(null), se = Vt(c), ge = Vt(p), _e = typeof c != "function" ? c : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  x && fe.push(x), fe.push(PT((Qe) => {
    const ft = jb(Qe, i, Y), Ut = typeof se.current == "function" ? se.current(ft) : se.current, kt = typeof ge.current == "function" ? ge.current(ft) : ge.current;
    return {
      mainAxis: Ut,
      crossAxis: kt,
      alignmentAxis: kt
    };
  }, [_e, Ee, Y, i]));
  const ye = X === "none" && _ !== "shift", Te = !ye && (d || A || _ === "shift"), He = _ === "none" ? null : QT({
    ...ae,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: B.top + E,
      right: B.right + E,
      bottom: B.bottom + E,
      left: B.left + E
    },
    mainAxis: !A && _ === "flip",
    crossAxis: X === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: q
  }), ke = ye ? null : XT((Qe) => {
    const ft = et(Qe.elements.floating).documentElement;
    return {
      ...ae,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: A ? {
        x: 0,
        y: 0,
        width: ft.clientWidth,
        height: ft.clientHeight
      } : void 0,
      mainAxis: X !== "none",
      crossAxis: Te,
      limiter: d || A ? void 0 : KT((Ut) => {
        if (!le.current)
          return {};
        const {
          width: kt,
          height: Ht
        } = le.current.getBoundingClientRect(), Dt = Jn(Un(Ut.placement)), Yt = Dt === "y" ? kt : Ht, bn = Dt === "y" ? B.left + B.right : B.top + B.bottom;
        return {
          offset: Yt / 2 + bn / 2
        };
      })
    };
  }, [ae, d, A, B, X]);
  _ === "shift" || X === "shift" || f === "center" ? fe.push(ke, He) : fe.push(He, ke), fe.push(ZT({
    ...ae,
    apply({
      elements: {
        floating: Qe
      },
      availableWidth: ft,
      availableHeight: Ut,
      rects: kt
    }) {
      if (!G.current)
        return;
      const Ht = Qe.style;
      Ht.setProperty("--available-width", `${ft}px`), Ht.setProperty("--available-height", `${Ut}px`);
      const Dt = At(Qe).devicePixelRatio || 1, {
        x: Yt,
        y: bn,
        width: An,
        height: Bn
      } = kt.reference, Gt = (Math.round((Yt + An) * Dt) - Math.round(Yt * Dt)) / Dt, In = (Math.round((bn + Bn) * Dt) - Math.round(bn * Dt)) / Dt;
      Ht.setProperty("--anchor-width", `${Gt}px`), Ht.setProperty("--anchor-height", `${In}px`);
    }
  }), wO((Qe) => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: le.current || et(Qe.elements.floating).createElement("div"),
    padding: b,
    offsetParent: "floating"
  }), [b]), {
    name: "transformOrigin",
    fn(Qe) {
      const {
        elements: ft,
        middlewareData: Ut,
        placement: kt,
        rects: Ht,
        y: Dt
      } = Qe, Yt = Un(kt), bn = Jn(Yt), An = le.current, Bn = Ut.arrow?.x || 0, Gt = Ut.arrow?.y || 0, In = An?.clientWidth || 0, gl = An?.clientHeight || 0, Wn = Bn + In / 2, ml = Gt + gl / 2, Pe = Math.abs(Ut.shift?.y || 0), bt = Ht.reference.height / 2, qt = typeof c == "function" ? c(jb(Qe, i, Y)) : c, en = Pe > qt, Jt = {
        top: `${Wn}px calc(100% + ${qt}px)`,
        bottom: `${Wn}px ${-qt}px`,
        left: `calc(100% + ${qt}px) ${ml}px`,
        right: `${-qt}px ${ml}px`
      }[Yt], Rt = `${Wn}px ${Ht.reference.y + bt - Dt}px`;
      return ft.floating.style.setProperty("--transform-origin", Te && bn === "y" && en ? Rt : Jt), {};
    }
  }, RO, z), xe(() => {
    !C && S && S.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [C, S]);
  const we = y.useMemo(() => ({
    elementResize: !v && typeof ResizeObserver < "u",
    layoutShift: !v && typeof IntersectionObserver < "u"
  }), [v]), {
    refs: Ce,
    elements: he,
    x: Se,
    y: Re,
    middlewareData: Oe,
    update: je,
    placement: oe,
    context: pe,
    isPositioned: Ue,
    floatingStyles: be
  } = yC({
    rootContext: S,
    open: T ? C : void 0,
    placement: K,
    middleware: fe,
    strategy: a,
    whileElementsMounted: T ? void 0 : (...Qe) => Rb(...Qe, we),
    nodeId: O,
    externalTree: L
  }), {
    sideX: ve,
    sideY: We
  } = Oe.adaptiveOrigin || $s, lt = Ue ? a : "fixed", pt = y.useMemo(() => {
    const Qe = z ? {
      position: lt,
      [ve]: Se,
      [We]: Re
    } : {
      position: lt,
      ...be
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [z, lt, ve, Se, We, Re, be, Ue]), zt = y.useRef(null);
  xe(() => {
    if (!C)
      return;
    const Qe = Z.current, ft = typeof Qe == "function" ? Qe() : Qe, kt = (Ub(ft) ? ft.current : ft) || null || null;
    kt !== zt.current && (Ce.setPositionReference(kt), zt.current = kt);
  }, [C, Ce, J, Z]), y.useEffect(() => {
    if (!C)
      return;
    const Qe = Z.current;
    typeof Qe != "function" && Ub(Qe) && Qe.current !== zt.current && (Ce.setPositionReference(Qe.current), zt.current = Qe.current);
  }, [C, Ce, J, Z]), y.useEffect(() => {
    if (T && C && he.reference && he.floating)
      return Rb(he.reference, he.floating, je, we);
  }, [T, C, he, je, we]);
  const $e = Un(oe), gt = $0(i, $e, Y), Mt = To(oe) || "center", mt = !!Oe.hide?.referenceHidden;
  xe(() => {
    M && C && Ue && j($e);
  }, [M, C, Ue, $e]);
  const On = y.useMemo(() => ({
    position: "absolute",
    top: Oe.arrow?.y,
    left: Oe.arrow?.x
  }), [Oe.arrow]), Mn = Oe.arrow?.centerOffset !== 0;
  return y.useMemo(() => ({
    positionerStyles: pt,
    arrowStyles: On,
    arrowRef: le,
    arrowUncentered: Mn,
    side: gt,
    align: Mt,
    physicalSide: $e,
    anchorHidden: mt,
    refs: Ce,
    context: pe,
    isPositioned: Ue,
    update: je
  }), [pt, On, le, Mn, gt, Mt, $e, mt, Ce, pe, Ue, je]);
}
function Ub(n) {
  return n != null && "current" in n;
}
function _p(n) {
  const {
    children: r,
    elementsRef: a,
    labelsRef: i,
    onMapChange: c
  } = n, f = De(c), p = y.useRef(0), g = yn(CO).current, m = yn(TO).current, [d, b] = y.useState(0), v = y.useRef(d), x = De((A, O) => {
    m.set(A, O ?? null), v.current += 1, b(v.current);
  }), T = De((A) => {
    m.delete(A), v.current += 1, b(v.current);
  }), S = y.useMemo(() => {
    const A = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((z) => z.isConnected).sort(OO).forEach((z, M) => {
      const L = m.get(z) ?? {};
      A.set(z, {
        ...L,
        index: M
      });
    }), A;
  }, [m, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || S.size === 0)
      return;
    const A = new MutationObserver((O) => {
      const z = /* @__PURE__ */ new Set(), M = (L) => z.has(L) ? z.delete(L) : z.add(L);
      O.forEach((L) => {
        L.removedNodes.forEach(M), L.addedNodes.forEach(M);
      }), z.size === 0 && (v.current += 1, b(v.current));
    });
    return S.forEach((O, z) => {
      z.parentElement && A.observe(z.parentElement, {
        childList: !0
      });
    }), () => {
      A.disconnect();
    };
  }, [S]), xe(() => {
    v.current === d && (a.current.length !== S.size && (a.current.length = S.size), i && i.current.length !== S.size && (i.current.length = S.size), p.current = S.size), f(S);
  }, [f, S, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const C = De((A) => (g.add(A), () => {
    g.delete(A);
  }));
  xe(() => {
    g.forEach((A) => A(S));
  }, [g, S]);
  const R = y.useMemo(() => ({
    register: x,
    unregister: T,
    subscribeMapChange: C,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [x, T, C, a, i, p]);
  return /* @__PURE__ */ k.jsx(K0.Provider, {
    value: R,
    children: r
  });
}
function TO() {
  return /* @__PURE__ */ new Map();
}
function CO() {
  return /* @__PURE__ */ new Set();
}
function OO(n, r) {
  const a = n.compareDocumentPosition(r);
  return a & Node.DOCUMENT_POSITION_FOLLOWING || a & Node.DOCUMENT_POSITION_CONTAINED_BY ? -1 : a & Node.DOCUMENT_POSITION_PRECEDING || a & Node.DOCUMENT_POSITION_CONTAINS ? 1 : 0;
}
function kp(n, r, {
  styles: a,
  transitionStatus: i,
  props: c,
  refs: f,
  hidden: p,
  inert: g = !1
}) {
  const m = {
    ...a
  };
  return g && (m.pointerEvents = "none"), it("div", n, {
    state: r,
    ref: f,
    props: [{
      role: "presentation",
      hidden: p,
      style: m
    }, Lu(i), c],
    stateAttributesMapping: ir
  });
}
const MO = 20;
function ex(n, r, a, i) {
  const [c, f] = y.useState(!1);
  xe(() => {
    if (!n || !r || a == null) {
      f(!1);
      return;
    }
    const p = et(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - MO);
  }, [n, r, a]), Rv(n && (!r || c), i);
}
const AO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    anchor: i,
    positionMethod: c = "absolute",
    className: f,
    render: p,
    side: g,
    align: m,
    sideOffset: d = 0,
    alignOffset: b = 0,
    collisionBoundary: v = "clipping-ancestors",
    collisionPadding: x = 5,
    arrowPadding: T = 5,
    sticky: S = !1,
    disableAnchorTracking: C = !1,
    collisionAvoidance: R = Xv,
    style: A,
    ...O
  } = r, {
    store: z
  } = pl(), M = bO(), L = Uu(!0), D = z.useState("parent"), j = z.useState("floatingRootContext"), _ = z.useState("floatingTreeRoot"), X = z.useState("mounted"), q = z.useState("open"), re = z.useState("modal"), Q = z.useState("openMethod"), J = z.useState("activeTriggerElement"), Z = z.useState("transitionStatus"), G = z.useState("positionerElement"), N = z.useState("instantType"), Y = z.useState("hasViewport"), I = z.useState("lastOpenChangeReason"), K = z.useState("floatingNodeId"), B = z.useState("floatingParentNodeId"), E = j.useState("domReferenceElement"), H = y.useRef(null), te = g0(G, !1, !1);
  let ee = i, ie = d, ae = b, le = m, se = R;
  D.type === "context-menu" && (ee = i ?? D.context?.anchor, le = le ?? "start", !g && le !== "center" && (ae = r.alignOffset ?? 2, ie = r.sideOffset ?? -5));
  let ge = g, _e = le;
  D.type === "menu" ? (ge = ge ?? "inline-end", _e = _e ?? "start", se = r.collisionAvoidance ?? Kv) : D.type === "menubar" && (ge = ge ?? (D.context.orientation === "vertical" ? "inline-end" : "bottom"), _e = _e ?? "start");
  const Ee = D.type === "context-menu", fe = Np({
    anchor: ee,
    floatingRootContext: j,
    positionMethod: L ? "fixed" : c,
    mounted: X,
    side: ge,
    sideOffset: ie,
    align: _e,
    alignOffset: ae,
    arrowPadding: Ee ? 0 : T,
    collisionBoundary: v,
    collisionPadding: x,
    sticky: S,
    nodeId: K,
    keepMounted: M,
    disableAnchorTracking: C,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: _,
    adaptiveOrigin: Y ? W0 : void 0
  });
  y.useEffect(() => {
    function Se(Re) {
      Re.open && (Re.parentNodeId === K && z.set("hoverEnabled", !1), Re.nodeId !== K && Re.parentNodeId === z.select("floatingParentNodeId") && z.setOpen(!1, Ge(ti)));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [z, _.events, K]), y.useEffect(() => {
    if (z.select("floatingParentNodeId") == null)
      return;
    function Se(Re) {
      if (Re.open || Re.nodeId !== z.select("floatingParentNodeId"))
        return;
      const Oe = Re.reason ?? ti;
      z.setOpen(!1, Ge(Oe));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [_.events, z]);
  const ye = rn();
  y.useEffect(() => {
    q || ye.clear();
  }, [q, ye]), y.useEffect(() => {
    function Se(Re) {
      if (!(!q || Re.nodeId !== z.select("floatingParentNodeId")))
        if (Re.target && J && J !== Re.target) {
          const Oe = z.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            z.setOpen(!1, Ge(ti));
          }) : z.setOpen(!1, Ge(ti));
        } else
          ye.clear();
    }
    return _.events.on("itemhover", Se), () => {
      _.events.off("itemhover", Se);
    };
  }, [_.events, q, J, z, ye]), y.useEffect(() => {
    const Se = {
      open: q,
      nodeId: K,
      parentNodeId: B,
      reason: z.select("lastOpenChangeReason")
    };
    _.events.emit("menuopenchange", Se);
  }, [_.events, q, z, K, B]), xe(() => {
    const Se = E, Re = H.current;
    if (Se && (H.current = Se), Re && Se && Se !== Re) {
      z.set("instantType", void 0);
      const Oe = new AbortController();
      return te(() => {
        z.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [E, te, z]);
  const Te = {
    open: q,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: D.type === "menu",
    instant: N
  }, He = D.type === "menubar" && D.context.modal;
  ex(q && (He || re && I !== on), Q === "touch", G, J);
  const we = kp(r, Te, {
    styles: fe.positionerStyles,
    transitionStatus: Z,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !X,
    inert: !q
  }), Ce = X && D.type !== "menu" && (D.type !== "menubar" && re && I !== on || D.type === "menubar" && D.context.modal);
  let he = null;
  return D.type === "menubar" ? he = D.context.contentElement : D.type === void 0 && (he = J), /* @__PURE__ */ k.jsxs(G0.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ k.jsx(Ap, {
      ref: D.type === "context-menu" || D.type === "nested-context-menu" ? D.context.internalBackdropRef : null,
      inert: Mp(!q),
      cutout: he
    }), /* @__PURE__ */ k.jsx(nT, {
      id: K,
      children: /* @__PURE__ */ k.jsx(_p, {
        elementsRef: z.context.itemDomElements,
        labelsRef: z.context.itemLabels,
        children: we
      })
    })]
  });
}), zO = /* @__PURE__ */ y.createContext(null);
function tx(n) {
  return y.useContext(zO);
}
const DO = {
  ...Sp,
  disabled: me((n) => n.parent.type === "menubar" && n.parent.context.disabled || n.disabled),
  modal: me((n) => (n.parent.type === void 0 || n.parent.type === "context-menu") && (n.modal ?? !0)),
  openMethod: me((n) => n.openMethod),
  allowMouseEnter: me((n) => n.allowMouseEnter),
  highlightItemOnHover: me((n) => n.highlightItemOnHover),
  stickIfOpen: me((n) => n.stickIfOpen),
  parent: me((n) => n.parent),
  rootId: me((n) => n.parent.type === "menu" ? n.parent.store.select("rootId") : n.parent.type !== void 0 ? n.parent.context.rootId : n.rootId),
  activeIndex: me((n) => n.activeIndex),
  isActive: me((n, r) => n.activeIndex === r),
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
class Hp extends Mu {
  constructor(r) {
    super({
      ...NO(),
      ...r
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
      triggerElements: new yi()
    }, DO), this.unsubscribeParentListener = this.observe("parent", (a) => {
      if (this.unsubscribeParentListener?.(), a.type === "menu") {
        let i = a.store.select("rootId"), c = a.store.select("floatingTreeRoot"), f = a.store.select("keyboardEventRelay");
        this.unsubscribeParentListener = a.store.subscribe(() => {
          const p = a.store.select("rootId"), g = a.store.select("floatingTreeRoot"), m = a.store.select("keyboardEventRelay");
          i === p && c === g && f === m || (i = p, c = g, f = m, this.notifyAll());
        }), this.context.allowMouseUpTriggerRef = a.store.context.allowMouseUpTriggerRef;
        return;
      }
      a.type !== void 0 && (this.context.allowMouseUpTriggerRef = a.context.allowMouseUpTriggerRef), this.unsubscribeParentListener = null;
    });
  }
  setOpen(r, a) {
    this.state.floatingRootContext.context.events.emit("setOpen", {
      open: r,
      eventDetails: a
    });
  }
  static useStore(r, a) {
    const i = yn(() => new Hp(a)).current;
    return r ?? i;
  }
  unsubscribeParentListener = null;
}
function NO() {
  return {
    ...vp(),
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
    floatingTreeRoot: new up(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: Ot,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const nx = /* @__PURE__ */ y.createContext(void 0);
function lx() {
  return y.useContext(nx);
}
const ox = gp(function(r) {
  const {
    children: a,
    open: i,
    onOpenChange: c,
    onOpenChangeComplete: f,
    defaultOpen: p = !1,
    disabled: g = !1,
    modal: m,
    loopFocus: d = !0,
    orientation: b = "vertical",
    actionsRef: v,
    closeParentOnEsc: x = !1,
    handle: T,
    triggerId: S,
    defaultTriggerId: C = null,
    highlightItemOnHover: R = !0
  } = r, A = Uu(!0), O = pl(!0), z = tx(!0), M = lx(), L = y.useMemo(() => M && O ? {
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
  }, [A, O, z, M]), D = Hp.useStore(T?.store, {
    open: p,
    openProp: i,
    activeTriggerId: C,
    triggerIdProp: S,
    parent: L
  });
  b0(D, i, p, C), D.useControlledProp("openProp", i), D.useControlledProp("triggerIdProp", S), D.useContextCallback("onOpenChangeComplete", f);
  const j = $o(), _ = $o(), X = D.useState("floatingTreeRoot"), q = e0(X), re = Co(), Q = D.useState("open"), J = D.useState("activeTriggerElement"), Z = D.useState("positionerElement"), G = D.useState("hoverEnabled"), N = D.useState("disabled"), Y = D.useState("lastOpenChangeReason"), I = D.useState("parent"), K = D.useState("activeIndex"), B = D.useState("payload"), E = D.useState("floatingParentNodeId"), H = y.useRef(null), te = y.useRef(I.type !== "context-menu"), ee = rn(), ie = y.useRef(!0), ae = rn(), le = E != null, {
    openMethod: se,
    triggerProps: ge
  } = Y0(Q);
  D.useSyncedValues({
    disabled: g,
    highlightItemOnHover: R,
    modal: I.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: j
  }), hp(D);
  const {
    forceUnmount: _e
  } = yp(Q, D, () => {
    D.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    A && !O ? D.update({
      parent: {
        type: "context-menu",
        context: A
      },
      floatingNodeId: q,
      floatingParentNodeId: re
    }) : O && D.update({
      floatingNodeId: q,
      floatingParentNodeId: re
    });
  }, [A, O, q, re, D]), y.useEffect(() => {
    if (Q || (H.current = null), I.type === "context-menu") {
      if (!Q) {
        ee.clear(), te.current = !1;
        return;
      }
      ee.start(500, () => {
        te.current = !0;
      });
    }
  }, [ee, Q, I.type]), xe(() => {
    !Q && !G && D.set("hoverEnabled", !0);
  }, [Q, G, D]);
  const Ee = De((ve, We) => {
    const lt = We.reason;
    if (Q === ve && We.trigger === J && Y === lt)
      return;
    const pt = y0(We);
    if (!ve && We.trigger == null && (We.trigger = J ?? void 0), c?.(ve, We), We.isCanceled)
      return;
    D.state.floatingRootContext.dispatchOpenChange(ve, We);
    const zt = We.event;
    if (ve === !1 && zt?.type === "click" && zt.pointerType === "touch" && !ie.current)
      return;
    ve && lt === Xr ? (ie.current = !1, ae.start(300, () => {
      ie.current = !0;
    })) : (ie.current = !0, ae.clear());
    const $e = (lt === na || lt === Kr) && zt.detail === 0 && zt?.isTrusted, gt = !ve && (lt === Ru || lt == null), Mt = {
      open: ve,
      openChangeReason: lt
    };
    H.current = We.event ?? null, mp(Mt, ve, We.trigger, pt()), D.update(Mt), I.type === "menubar" && (lt === Xr || lt === Wo || lt === on || lt === Od || lt === ti) ? D.set("instantType", "group") : $e || gt ? D.set("instantType", $e ? "click" : "dismiss") : D.set("instantType", void 0);
  }), fe = p0({
    popupStore: D,
    floatingId: _,
    nested: re != null,
    onOpenChange: Ee
  }), ye = fe.context.events;
  y.useEffect(() => {
    const ve = ({
      open: We,
      eventDetails: lt
    }) => Ee(We, lt);
    return ye.on("setOpen", ve), () => {
      ye?.off("setOpen", ve);
    };
  }, [ye, Ee]);
  const Te = y.useCallback(() => {
    D.setOpen(!1, Ge(np));
  }, [D]);
  y.useImperativeHandle(v, () => ({
    unmount: _e,
    close: Te
  }), [_e, Te]);
  let He;
  I.type === "context-menu" && (He = I.context), y.useImperativeHandle(He?.positionerRef, () => Z, [Z]), y.useImperativeHandle(He?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Cu(fe, {
    enabled: !N,
    bubbles: {
      escapeKey: x && I.type === "menu"
    },
    outsidePress() {
      return I.type !== "context-menu" || H.current?.type === "contextmenu" ? !0 : te.current;
    },
    externalTree: le ? X : void 0
  }), we = Bu(), Ce = y.useCallback((ve) => {
    D.select("activeIndex") !== ve && D.set("activeIndex", ve);
  }, [D]), he = C0(fe, {
    enabled: !N,
    listRef: D.context.itemDomElements,
    activeIndex: K,
    nested: I.type !== void 0,
    loopFocus: d,
    orientation: b,
    parentOrientation: I.type === "menubar" ? I.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: Yl,
    onNavigate: Ce,
    openOnArrowKeyDown: I.type !== "context-menu",
    externalTree: le ? X : void 0,
    focusItemOnHover: R
  }), Se = y.useCallback((ve) => {
    D.context.typingRef.current = ve;
  }, [D]), Re = O0(fe, {
    enabled: !N,
    listRef: D.context.itemLabels,
    elementsRef: D.context.itemDomElements,
    activeIndex: K,
    resetMs: FR,
    onMatch: (ve) => {
      Q && ve !== K && D.set("activeIndex", ve);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const ve = Tn(Re.reference, he.reference, ke.reference, {
      onMouseMove() {
        D.set("allowMouseEnter", !0);
      }
    }, ge);
    return ve["aria-haspopup"] = "menu", ve["aria-expanded"] = Q, ve;
  }, [D, Re.reference, he.reference, ke.reference, ge, Q]), je = y.useMemo(() => {
    const ve = Tn(he.trigger, ke.trigger, ge);
    return ve["aria-haspopup"] = "menu", ve["aria-expanded"] = !1, ve;
  }, [he.trigger, ke.trigger, ge]), oe = y.useMemo(() => Tn(Du, {
    id: _,
    role: "menu",
    "aria-labelledby": J?.id,
    onMouseMove() {
      D.set("allowMouseEnter", !0), I.type === "menu" && D.set("hoverEnabled", !1);
    },
    onClick() {
      D.select("hoverEnabled") && D.set("hoverEnabled", !1);
    },
    onKeyDown(ve) {
      const We = D.select("keyboardEventRelay");
      We && !ve.isPropagationStopped() && We(ve);
    }
  }, Re.floating, he.floating, ke.floating), [J, _, I.type, D, Re.floating, he.floating, ke.floating]), pe = he.item ?? Ot;
  bp(D, {
    floatingRootContext: fe,
    activeTriggerProps: Oe,
    inactiveTriggerProps: je,
    popupProps: oe,
    itemProps: pe
  });
  const Ue = y.useMemo(() => ({
    store: D,
    parent: L
  }), [D, L]), be = /* @__PURE__ */ k.jsx(q0.Provider, {
    value: Ue,
    children: typeof a == "function" ? a({
      payload: B
    }) : a
  });
  return I.type === void 0 || I.type === "context-menu" ? /* @__PURE__ */ k.jsx(lT, {
    externalTree: X,
    children: be
  }) : be;
});
function _O(n) {
  const r = pl().store, a = y.useMemo(() => ({
    parentMenu: r
  }), [r]);
  return /* @__PURE__ */ k.jsx(nx.Provider, {
    value: a,
    children: /* @__PURE__ */ k.jsx(ox, {
      ...n
    })
  });
}
function rx(n) {
  const r = n.getBoundingClientRect(), a = At(n);
  if (Wd)
    return r;
  const i = a.getComputedStyle(n, "::before"), c = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || c.content !== "none"))
    return r;
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(c.width) || 0, d = parseFloat(c.height) || 0, b = Math.max(r.width, p, m), v = Math.max(r.height, g, d), x = b - r.width, T = v - r.height;
  return {
    left: r.left - x / 2,
    right: r.right + x / 2,
    top: r.top - T / 2,
    bottom: r.bottom + T / 2
  };
}
function kO(n = {}) {
  const {
    highlightItemOnHover: r,
    highlightedIndex: a,
    onHighlightedIndexChange: i
  } = Pd(), {
    ref: c,
    index: f
  } = bi(n), p = a === f, g = y.useRef(null), m = xo(c, g);
  return {
    compositeProps: {
      tabIndex: p ? 0 : -1,
      onFocus() {
        i(f);
      },
      onMouseMove() {
        const b = g.current;
        if (!r || !b)
          return;
        const v = b.hasAttribute("disabled") || b.ariaDisabled === "true";
        !p && !v && b.focus();
      }
    },
    compositeRef: m,
    index: f
  };
}
function ax(n) {
  const {
    render: r,
    className: a,
    style: i,
    state: c = Ot,
    props: f = Yl,
    refs: p = Yl,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...b
  } = n, {
    compositeProps: v,
    compositeRef: x
  } = kO({
    metadata: g
  });
  return it(d, n, {
    state: c,
    ref: [...p, x],
    props: [v, ...f, b],
    stateAttributesMapping: m
  });
}
function ix(n) {
  if (Ct(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Ll(n))
    return ix(Vl(n));
}
function HO(n, r) {
  const a = y.useRef(null);
  function i(f) {
    ql.flushSync(() => {
      n.setOpen(!1, Ge(Wo, f.nativeEvent, f.currentTarget));
    }), PR(a.current)?.focus();
  }
  function c(f) {
    const p = n.select("positionerElement");
    if (p && Qr(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      ql.flushSync(() => {
        n.setOpen(!1, Ge(Wo, f.nativeEvent, f.currentTarget));
      });
      let g = qR(n.context.triggerFocusTargetRef.current || r.current);
      for (; g !== null && Le(p, g); ) {
        const m = g;
        if (g = ip(g), g === m)
          break;
      }
      g?.focus();
    }
  }
  return {
    preFocusGuardRef: a,
    handlePreFocusGuardFocus: i,
    handleFocusTargetFocus: c
  };
}
function jO(n) {
  const {
    enabled: r = !0,
    mouseDownAction: a,
    open: i
  } = n, c = y.useRef(!1);
  return y.useMemo(() => r ? {
    onMouseDown: (f) => {
      (a === "open" && !i || a === "close" && i) && (c.current = !0, et(f.currentTarget).addEventListener("click", () => {
        c.current = !1;
      }, {
        once: !0
      }));
    },
    onClick: (f) => {
      c.current && (c.current = !1, f.preventBaseUIHandler());
    }
  } : Ot, [r, a, i]);
}
const qs = 2, UO = f0(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    id: m,
    openOnHover: d,
    delay: b = 100,
    closeDelay: v = 0,
    handle: x,
    payload: T,
    ...S
  } = r, C = pl(!0), R = x?.store ?? C?.store;
  if (!R)
    throw new Error(Lt(85));
  const A = dl(m), O = R.useState("isTriggerActive", A), z = R.useState("floatingRootContext"), M = R.useState("isOpenedByTrigger", A), L = R.useState("triggerPopupId", A), D = y.useRef(null), j = BO(), _ = Pd(!0), X = Oo(), q = y.useMemo(() => X ?? new up(), [X]), re = e0(q), Q = Co(), {
    registerTrigger: J,
    isMountedByThisTrigger: Z
  } = v0(A, D, R, {
    payload: T,
    closeDelay: v,
    parent: j,
    floatingTreeRoot: q,
    floatingNodeId: re,
    floatingParentNodeId: Q,
    keyboardEventRelay: _?.relayKeyboardEvent
  }), G = j.type === "menubar", N = R.useState("disabled"), Y = p || N || G && j.context.disabled, {
    getButtonProps: I,
    buttonRef: K
  } = lr({
    disabled: Y,
    native: g
  });
  y.useEffect(() => {
    !M && j.type === void 0 && (R.context.allowMouseUpTriggerRef.current = !1);
  }, [R, M, j.type]);
  const B = y.useRef(null), E = rn(), H = De((he) => {
    if (!B.current)
      return;
    E.clear(), R.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(B.current, Se) || Le(R.select("positionerElement"), Se) || Se === B.current || Se != null && ix(Se) === R.select("rootId"))
      return;
    const Re = rx(B.current);
    he.clientX >= Re.left - qs && he.clientX <= Re.right + qs && he.clientY >= Re.top - qs && he.clientY <= Re.bottom + qs || q.events.emit("close", {
      domEvent: he,
      reason: Av
    });
  });
  y.useEffect(() => {
    M && R.select("lastOpenChangeReason") === on && et(B.current).addEventListener("mouseup", H, {
      once: !0
    });
  }, [M, H, R]);
  const te = G && j.context.hasSubmenuOpen, ie = Rp(z, {
    enabled: (d ?? te) && !Y && j.type !== "context-menu" && (!G || te && !Z),
    handleClose: Tp({
      blockPointerEvents: !G
    }),
    mouseOnly: !0,
    move: !1,
    restMs: j.type === void 0 ? b : void 0,
    delay: {
      close: v
    },
    triggerElementRef: D,
    externalTree: q,
    isActiveTrigger: O,
    isClosing: () => R.select("transitionStatus") === "ending"
  }), ae = LO(M, R.select("lastOpenChangeReason")), le = dp(z, {
    enabled: !Y && j.type !== "context-menu",
    event: M && G ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: j.type === void 0 ? ae : !1
  }), se = E0(z, {
    enabled: !Y && te
  }), ge = jO({
    open: M,
    enabled: G,
    mouseDownAction: "open"
  }), _e = y.useMemo(() => Tn(se.reference, le.reference), [se.reference, le.reference]), Ee = R.useState("triggerProps", Z), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Te
  } = HO(R, D), He = {
    disabled: Y,
    open: M
  }, ke = [B, a, K, J, D], we = [_e, ie ?? Ot, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": L,
    id: A,
    onMouseDown: (he) => {
      if (R.select("open"))
        return;
      E.start(200, () => {
        R.context.allowMouseUpTriggerRef.current = !0;
      }), et(he.currentTarget).addEventListener("mouseup", H, {
        once: !0
      });
    }
  }, G ? {
    role: "menuitem"
  } : {}, ge, S, I], Ce = it("button", r, {
    enabled: !G,
    stateAttributesMapping: kd,
    state: He,
    ref: ke,
    props: we
  });
  return G ? /* @__PURE__ */ k.jsx(ax, {
    tag: "button",
    render: i,
    className: c,
    style: f,
    state: He,
    refs: ke,
    props: we,
    stateAttributesMapping: kd
  }) : M ? /* @__PURE__ */ k.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ k.jsx($r, {
      ref: fe,
      onFocus: ye
    }, `${A}-pre-focus-guard`), /* @__PURE__ */ k.jsx(y.Fragment, {
      children: Ce
    }, A), /* @__PURE__ */ k.jsx($r, {
      ref: R.context.triggerFocusTargetRef,
      onFocus: Te
    }, `${A}-post-focus-guard`)]
  }) : /* @__PURE__ */ k.jsx(y.Fragment, {
    children: Ce
  }, A);
});
function LO(n, r) {
  const a = rn(), [i, c] = y.useState(!1);
  return xe(() => {
    n && r === "trigger-hover" ? (c(!0), a.start(JR, () => {
      c(!1);
    })) : n || (a.clear(), c(!1));
  }, [n, r, a]), i;
}
function BO() {
  const n = Uu(!0), r = pl(!0), a = tx();
  return y.useMemo(() => a ? {
    type: "menubar",
    context: a
  } : n && !r ? {
    type: "context-menu",
    context: n
  } : {
    type: void 0
  }, [n, r, a]);
}
function IO(n) {
  const [r, a] = y.useState({
    current: n,
    previous: null
  });
  return n !== r.current && a({
    current: n,
    previous: r.current
  }), r.previous;
}
const VO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    className: i,
    render: c,
    orientation: f = "horizontal",
    style: p,
    ...g
  } = r;
  return it("div", r, {
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
function sx(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
const YO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    label: p,
    id: g,
    nativeButton: m = !1,
    openOnHover: d = !0,
    delay: b = 100,
    closeDelay: v = 0,
    disabled: x = !1,
    ...T
  } = r, S = bi({
    label: p
  }), C = ju(), {
    store: R
  } = pl(), A = dl(g), O = R.useState("open"), z = R.useState("floatingRootContext"), M = R.useState("floatingTreeRoot"), L = R.useState("triggerPopupId", A), D = h0(A, R), j = y.useCallback((le) => {
    const se = D(le);
    return le !== null && R.select("open") && R.select("activeTriggerId") == null && R.update({
      activeTriggerId: A,
      activeTriggerElement: le,
      closeDelay: v
    }), se;
  }, [D, v, R, A]), _ = y.useRef(null), X = y.useCallback((le) => {
    _.current = le, R.set("activeTriggerElement", le);
  }, [R]), q = lx();
  if (!q?.parentMenu)
    throw new Error(Lt(37));
  R.useSyncedValue("closeDelay", v);
  const re = q.parentMenu, Q = R.useState("disabled"), J = re.useState("disabled"), Z = x || Q || J, G = re.useState("itemProps"), N = re.useState("isActive", S.index), Y = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      re.select("highlightItemOnHover") && re.set("activeIndex", S.index);
    }
  }), [re, S.index]), {
    getItemProps: I,
    itemRef: K
  } = zp({
    closeOnClick: !1,
    disabled: Z,
    highlighted: N,
    id: A,
    store: R,
    typingRef: re.context.typingRef,
    nativeButton: m,
    itemMetadata: Y,
    nodeId: C?.context.nodeId
  }), B = R.useState("hoverEnabled"), E = Rp(z, {
    enabled: B && d && !Z,
    handleClose: Tp({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: b,
    delay: {
      open: b,
      close: v
    },
    shouldOpen: b > 0 ? () => re.select("allowMouseEnter") : void 0,
    triggerElementRef: _,
    externalTree: M,
    isClosing: () => R.select("transitionStatus") === "ending"
  }), te = dp(z, {
    enabled: !Z,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? Ot, ee = R.useState("triggerProps", !0);
  return delete ee.id, it("div", r, {
    state: {
      disabled: Z,
      highlighted: N,
      open: O
    },
    stateAttributesMapping: Op,
    props: [te, E, ee, G, {
      "aria-controls": L,
      tabIndex: O || N ? 0 : -1,
      onBlur() {
        N && re.set("activeIndex", null);
      }
    }, T, I],
    ref: [a, S.ref, K, j, X]
  });
});
function Lb({ ...n }) {
  return /* @__PURE__ */ k.jsx(ox, { "data-slot": "dropdown-menu", ...n });
}
function Bb({ ...n }) {
  return /* @__PURE__ */ k.jsx(UO, { "data-slot": "dropdown-menu-trigger", ...n });
}
function Hd({
  align: n = "start",
  alignOffset: r = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: c,
  ...f
}) {
  return /* @__PURE__ */ k.jsx(vO, { children: /* @__PURE__ */ k.jsx(
    AO,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: r,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ k.jsx(
        yO,
        {
          "data-slot": "dropdown-menu-content",
          className: st("tw:max-h-(--available-height) tw:w-(--anchor-width) tw:min-w-32 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:outline-none", c),
          ...f
        }
      )
    }
  ) });
}
function Pr({ ...n }) {
  return /* @__PURE__ */ k.jsx(dO, { "data-slot": "dropdown-menu-group", ...n });
}
function GO({
  className: n,
  inset: r,
  ...a
}) {
  return /* @__PURE__ */ k.jsx(
    pO,
    {
      "data-slot": "dropdown-menu-label",
      "data-inset": r,
      className: st(
        "tw:px-1.5 tw:py-1 tw:text-[var(--fs-caption)] tw:font-medium tw:text-muted-foreground tw:data-inset:pl-7",
        n
      ),
      ...a
    }
  );
}
function Ps({
  className: n,
  inset: r,
  variant: a = "default",
  ...i
}) {
  return /* @__PURE__ */ k.jsx(
    gO,
    {
      "data-slot": "dropdown-menu-item",
      "data-inset": r,
      "data-variant": a,
      className: st(
        "tw:group/dropdown-menu-item tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-[variant=destructive]:text-destructive tw:data-[variant=destructive]:focus:bg-destructive/10 tw:data-[variant=destructive]:focus:text-destructive tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4 tw:data-[variant=destructive]:*:[svg]:text-destructive",
        n
      ),
      ...i
    }
  );
}
function ux({ ...n }) {
  return /* @__PURE__ */ k.jsx(_O, { "data-slot": "dropdown-menu-sub", ...n });
}
function cx({
  className: n,
  inset: r,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ k.jsxs(
    YO,
    {
      "data-slot": "dropdown-menu-sub-trigger",
      "data-inset": r,
      className: st(
        "tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:px-1.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:not-data-[variant=destructive]:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-popup-open:bg-accent tw:data-popup-open:text-accent-foreground tw:data-open:bg-accent tw:data-open:text-accent-foreground tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ k.jsx(dE, { className: "tw:ml-auto" })
      ]
    }
  );
}
function fx({
  align: n = "start",
  alignOffset: r = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: c,
  ...f
}) {
  return /* @__PURE__ */ k.jsx(
    Hd,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: st("tw:w-auto tw:min-w-[96px] tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-lg tw:ring-1 tw:ring-foreground/10", c),
      align: n,
      alignOffset: r,
      side: a,
      sideOffset: i,
      ...f
    }
  );
}
function jd({
  className: n,
  children: r,
  checked: a,
  inset: i,
  ...c
}) {
  return /* @__PURE__ */ k.jsxs(
    uO,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      "data-inset": i,
      className: st(
        "tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:py-1 tw:pr-8 tw:pl-1.5 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      checked: a,
      ...c,
      children: [
        /* @__PURE__ */ k.jsx(
          "span",
          {
            className: "tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:items-center tw:justify-center",
            "data-slot": "dropdown-menu-checkbox-item-indicator",
            children: /* @__PURE__ */ k.jsx(cO, { children: /* @__PURE__ */ k.jsx(
              Wb,
              {}
            ) })
          }
        ),
        r
      ]
    }
  );
}
function Ib({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    VO,
    {
      "data-slot": "dropdown-menu-separator",
      className: st("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...r
    }
  );
}
let Vb = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const qO = {
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
}, ni = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, PO = {
  disabled: !1,
  ...ni
}, dx = {
  valid(n) {
    return n === null ? null : n ? {
      [Vb.valid]: ""
    } : {
      [Vb.invalid]: ""
    };
  }
}, XO = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: qO,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: ln,
  disabled: void 0,
  touched: ni.touched,
  setTouched: ln,
  dirty: ni.dirty,
  setDirty: ln,
  filled: ni.filled,
  setFilled: ln,
  focused: ni.focused,
  setFocused: ln,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => !1,
  state: PO,
  markedDirtyRef: {
    current: !1
  },
  registerFieldControl: ln,
  validation: {
    getValidationProps: (n, r = Ot) => r,
    inputRef: {
      current: null
    },
    registerInput: ln,
    commit: async () => {
    },
    change: ln
  }
}, KO = /* @__PURE__ */ y.createContext(XO);
function Iu(n = !0) {
  const r = y.useContext(KO);
  if (r.setValidityData === ln && !n)
    throw new Error(Lt(28));
  return r;
}
const QO = /* @__PURE__ */ y.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: ln,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: !1
  }
});
function px() {
  return y.useContext(QO);
}
const ZO = /* @__PURE__ */ y.createContext({
  controlId: void 0,
  registerControlId: ln,
  labelId: void 0,
  setLabelId: ln,
  messageIds: [],
  setMessageIds: ln,
  getDescriptionProps: (n) => n
});
function jp() {
  return y.useContext(ZO);
}
function Up(n = {}) {
  const {
    id: r,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: c,
    registerControlId: f
  } = jp(), p = dl(r), g = a ? c : void 0, m = yn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), b = y.useRef(r != null), v = De(() => {
    !d.current || f === ln || (d.current = !1, f(m.current, void 0));
  });
  return xe(() => {
    if (f === ln)
      return;
    let x;
    if (a) {
      const T = i?.current;
      Je(T) && T.closest("label") != null ? x = r ?? null : x = g ?? p;
    } else if (r != null)
      b.current = !0, x = r;
    else if (b.current)
      x = p;
    else {
      v();
      return;
    }
    if (x === void 0) {
      v();
      return;
    }
    d.current = !0, f(m.current, x);
  }, [r, i, g, f, a, p, m, v]), y.useEffect(() => v, [v]), c ?? p;
}
function gx(n, r, a, i, c = !0, f) {
  const {
    registerFieldControl: p
  } = Iu(), g = y.useRef(null);
  g.current || (g.current = /* @__PURE__ */ Symbol()), xe(() => {
    const m = g.current;
    return !m || !c ? void 0 : (p(m, {
      controlRef: n,
      getValue: i,
      id: r,
      name: f,
      value: a
    }), () => {
      p(m, void 0);
    });
  }, [n, c, i, r, f, p, a]);
}
const FO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    id: f,
    name: p,
    value: g,
    disabled: m = !1,
    onValueChange: d,
    defaultValue: b,
    autoFocus: v = !1,
    style: x,
    ...T
  } = r, {
    state: S,
    name: C,
    disabled: R,
    setTouched: A,
    setDirty: O,
    validityData: z,
    setFocused: M,
    setFilled: L,
    validationMode: D,
    validation: j
  } = Iu(), {
    clearErrors: _
  } = px(), X = R || m, q = C ?? p, re = {
    ...S,
    disabled: X
  }, {
    labelId: Q
  } = jp(), J = Up({
    id: f
  });
  xe(() => {
    const B = g != null;
    j.inputRef.current?.value || B && g !== "" ? L(!0) : B && g === "" && L(!1);
  }, [j.inputRef, L, g]);
  const Z = y.useRef(null);
  xe(() => {
    v && Z.current === hn(et(Z.current)) && M(!0);
  }, [v, M]);
  const [G] = ta({
    controlled: g,
    default: b,
    name: "FieldControl",
    state: "value"
  }), N = g !== void 0, Y = N ? G : void 0, I = De(() => j.inputRef.current?.value);
  return gx(j.inputRef, J, Y, I, !X, p), it("input", r, {
    ref: [a, Z],
    state: re,
    props: [{
      id: J,
      disabled: X,
      name: q,
      ref: j.inputRef,
      "aria-labelledby": Q,
      autoFocus: v,
      ...N ? {
        value: Y
      } : {
        defaultValue: b
      },
      onChange(B) {
        const E = B.currentTarget.value;
        d?.(E, Ge(Ro, B.nativeEvent)), O(E !== z.initialValue), L(E !== ""), B.nativeEvent.defaultPrevented || (_(q), j.change(E));
      },
      onFocus() {
        M(!0);
      },
      onBlur(B) {
        A(!0), M(!1), D === "onBlur" && j.commit(B.currentTarget.value);
      },
      onKeyDown(B) {
        B.currentTarget.tagName === "INPUT" && B.key === "Enter" && (A(!0), j.commit(B.currentTarget.value));
      }
    }, T, (B) => j.getValidationProps(X, B)],
    stateAttributesMapping: dx
  });
}), JO = /* @__PURE__ */ y.forwardRef(function(r, a) {
  return /* @__PURE__ */ k.jsx(FO, {
    ref: a,
    ...r
  });
});
function WO({ className: n, type: r, ...a }) {
  return /* @__PURE__ */ k.jsx(
    JO,
    {
      type: r,
      "data-slot": "input",
      className: st(
        "tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:px-2.5 tw:py-1 tw:text-[var(--fs-body-s)] tw:text-foreground tw:outline-none tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-2 tw:aria-invalid:ring-destructive/20",
        n
      ),
      ...a
    }
  );
}
function $O({ className: n, ...r }) {
  return /* @__PURE__ */ k.jsx(
    "div",
    {
      "data-slot": "input-group",
      role: "group",
      className: st(
        "tw:group/input-group tw:relative tw:flex tw:h-8 tw:w-full tw:min-w-0 tw:items-center tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:transition-colors tw:duration-[var(--motion-fast)] tw:outline-none tw:in-data-[slot=combobox-content]:focus-within:border-inherit tw:in-data-[slot=combobox-content]:focus-within:ring-0 tw:has-disabled:bg-input/50 tw:has-disabled:opacity-50 tw:has-[[data-slot=input-group-control]:focus-visible]:border-ring tw:has-[[data-slot=input-group-control]:focus-visible]:ring-2 tw:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/40 tw:has-[[data-slot][aria-invalid=true]]:border-destructive tw:has-[[data-slot][aria-invalid=true]]:ring-2 tw:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 tw:has-[>[data-align=block-end]]:h-auto tw:has-[>[data-align=block-end]]:flex-col tw:has-[>[data-align=block-start]]:h-auto tw:has-[>[data-align=block-start]]:flex-col tw:has-[>textarea]:h-auto tw:has-[>[data-align=block-end]]:[&>input]:pt-3 tw:has-[>[data-align=block-start]]:[&>input]:pb-3 tw:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 tw:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        n
      ),
      ...r
    }
  );
}
const eM = Kd(
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
function tM({
  className: n,
  align: r = "inline-start",
  ...a
}) {
  return /* @__PURE__ */ k.jsx(
    "div",
    {
      role: "group",
      "data-slot": "input-group-addon",
      "data-align": r,
      className: st(eM({ align: r }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
function nM({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    WO,
    {
      "data-slot": "input-group-control",
      className: st(
        "tw:flex-1 tw:rounded-none tw:border-0 tw:bg-transparent tw:shadow-none tw:ring-0 tw:focus-visible:ring-0 tw:disabled:bg-transparent tw:aria-invalid:ring-0",
        n
      ),
      ...r
    }
  );
}
const mx = /* @__PURE__ */ y.createContext(null), hx = /* @__PURE__ */ y.createContext(null);
function Xl() {
  const n = y.useContext(mx);
  if (n === null)
    throw new Error(Lt(60));
  return n;
}
function yx() {
  const n = y.useContext(hx);
  if (n === null)
    throw new Error(Lt(61));
  return n;
}
const lM = (n, r) => Object.is(n, r);
function tr(n, r, a) {
  return n == null || r == null ? Object.is(n, r) : a(n, r);
}
function oM(n, r, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : tr(r, i, a));
}
function ui(n, r, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : tr(i, r, a));
}
function rM(n, r, a) {
  return n.filter((i) => !tr(r, i, a));
}
function Ud(n) {
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
function bx(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function aM(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const r = n;
  if (bx(r)) {
    for (const a of r)
      for (const i of a.items)
        if (i && i.value == null && i.label != null)
          return !0;
    return !1;
  }
  for (const a of r)
    if (a && a.value == null && a.label != null)
      return !0;
  return !1;
}
function vx(n, r) {
  if (r && n != null)
    return r(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return Ud(n);
}
function Qo(n, r) {
  return r && n != null ? r(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? Ud(n.value) : Ud(n);
}
function xx(n, r, a) {
  function i() {
    return vx(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (r && !Array.isArray(r))
    return r[n] ?? i();
  if (Array.isArray(r)) {
    const c = r, f = bx(c) ? c.flatMap((p) => p.items) : c;
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
function iM(n, r, a) {
  return n.reduce((i, c, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ k.jsx(y.Fragment, {
    children: xx(c, r, a)
  }, f)), i), []);
}
const Ie = {
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
      value: r,
      multiple: a,
      itemToStringValue: i
    } = n;
    return r == null ? !1 : a && Array.isArray(r) ? r.length > 0 : Qo(r, i) !== "";
  }),
  hasNullItemLabel: me((n, r) => r ? aM(n.items) : !1),
  open: me((n) => n.open),
  mounted: me((n) => n.mounted),
  forceMount: me((n) => n.forceMount),
  transitionStatus: me((n) => n.transitionStatus),
  openMethod: me((n) => n.openMethod),
  activeIndex: me((n) => n.activeIndex),
  selectedIndex: me((n) => n.selectedIndex),
  isActive: me((n, r) => n.activeIndex === r),
  isSelected: me((n, r) => {
    const a = n.isItemEqualToValue, i = n.value;
    return n.multiple ? Array.isArray(i) && i.some((c) => tr(r, c, a)) : tr(r, i, a);
  }),
  isSelectedByFocus: me((n, r) => n.selectedIndex === r),
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
function sM(n, r, a = (i, c) => i === c) {
  return n.length === r.length && n.every((i, c) => a(i, r[c]));
}
function li(n, r = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(r, Math.min(n, a));
}
const jl = 1;
function Sx(n, r) {
  return Math.max(0, n - r);
}
function uM(n, r) {
  if (r <= 0)
    return 0;
  const a = li(n, 0, r), i = a, c = r - a, f = i <= jl, p = c <= jl;
  return f && p ? i <= c ? 0 : r : f ? 0 : p ? r : a;
}
function cM(n) {
  const {
    id: r,
    value: a,
    defaultValue: i = null,
    onValueChange: c,
    open: f,
    defaultOpen: p = !1,
    onOpenChange: g,
    name: m,
    form: d,
    autoComplete: b,
    disabled: v = !1,
    readOnly: x = !1,
    required: T = !1,
    modal: S = !0,
    actionsRef: C,
    inputRef: R,
    onOpenChangeComplete: A,
    items: O,
    multiple: z = !1,
    itemToStringLabel: M,
    itemToStringValue: L,
    isItemEqualToValue: D = lM,
    highlightItemOnHover: j = !0,
    children: _
  } = n, {
    clearErrors: X
  } = px(), {
    setDirty: q,
    setTouched: re,
    setFocused: Q,
    validityData: J,
    setFilled: Z,
    name: G,
    disabled: N,
    validation: Y,
    validationMode: I
  } = Iu(), K = Up({
    id: r
  }), B = N || v, E = G ?? m, [H, te] = ta({
    controlled: a,
    default: z ? i ?? Yl : i,
    name: "Select",
    state: "value"
  }), [ee, ie] = ta({
    controlled: f,
    default: p,
    name: "Select",
    state: "open"
  }), ae = y.useRef([]), le = y.useRef([]), se = y.useRef(null), ge = y.useRef(null), _e = y.useRef(0), Ee = y.useRef(null), fe = y.useRef([]), ye = y.useRef(!1), Te = y.useRef(null), He = y.useRef(null), ke = y.useRef({
    allowSelectedMouseUp: !1,
    allowUnselectedMouseUp: !1,
    dragY: 0
  }), we = y.useRef(!1), {
    mounted: Ce,
    setMounted: he,
    transitionStatus: Se
  } = zu(ee), {
    openMethod: Re,
    triggerProps: Oe
  } = Y0(ee), je = yn(() => new d0({
    id: K,
    labelId: void 0,
    modal: S,
    multiple: z,
    itemToStringLabel: M,
    itemToStringValue: L,
    isItemEqualToValue: D,
    value: H,
    open: ee,
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
  })).current, oe = Ye(je, Ie.activeIndex), pe = Ye(je, Ie.selectedIndex), Ue = Ye(je, Ie.triggerElement), be = Ye(je, Ie.positionerElement), ve = IO(Re), We = Re ?? ve ?? null, lt = y.useMemo(() => z ? "" : Qo(H, L), [z, H, L]), pt = y.useMemo(() => z && Array.isArray(H) ? H.map((Pe) => Qo(Pe, L)) : Qo(H, L), [z, H, L]), zt = Vt(je.state.triggerElement), $e = De(() => pt);
  gx(zt, K, H, $e, !B, m);
  const gt = y.useRef(H), Mt = z ? Array.isArray(H) && H.length > 0 : H != null && Qo(H, L) !== "";
  xe(() => {
    H !== gt.current && je.set("forceMount", !0);
  }, [je, H]), xe(() => {
    Z(Mt);
  }, [Mt, Z]), xe(function() {
    const bt = fe.current;
    let qt;
    if (z) {
      const en = Array.isArray(H) ? H : [];
      if (en.length === 0)
        qt = null;
      else {
        const Jt = en[en.length - 1], Rt = ui(bt, Jt, D);
        qt = Rt === -1 ? null : Rt;
      }
    } else {
      const en = ui(bt, H, D);
      qt = en === -1 ? null : en;
    }
    qt === null && (He.current = null), !ee && je.set("selectedIndex", qt);
  }, [Mt, z, ee, H, fe, D, je, He]);
  function mt(Pe) {
    const bt = J.initialValue;
    return Array.isArray(Pe) && Array.isArray(bt) ? !sM(Pe, bt, (qt, en) => tr(qt, en, D)) : Pe !== bt;
  }
  V0(H, () => {
    X(E), q(mt(H)), Y.change(H);
  });
  const On = De((Pe, bt) => {
    g?.(Pe, bt), !bt.isCanceled && (ie(Pe), !Pe && (bt.reason === Wo || bt.reason === Eu) && (re(!0), Q(!1), I === "onBlur" && Y.commit(H)));
  }), Mn = De(() => {
    he(!1), je.update({
      activeIndex: null,
      openMethod: null
    }), A?.(!1);
  });
  Mo({
    enabled: !C,
    open: ee,
    ref: se,
    onComplete() {
      ee || Mn();
    }
  }), y.useImperativeHandle(C, () => ({
    unmount: Mn
  }), [Mn]);
  const Qe = De((Pe, bt) => {
    c?.(Pe, bt), !bt.isCanceled && te(Pe);
  }), ft = De(() => {
    const Pe = je.state.listElement || se.current;
    if (!Pe)
      return;
    const bt = Sx(Pe.scrollHeight, Pe.clientHeight), qt = uM(Pe.scrollTop, bt), en = qt > 0, Jt = qt < bt;
    je.state.scrollUpArrowVisible !== en && je.set("scrollUpArrowVisible", en), je.state.scrollDownArrowVisible !== Jt && je.set("scrollDownArrowVisible", Jt);
  }), Ut = w0({
    open: ee,
    onOpenChange: On,
    elements: {
      reference: Ue,
      floating: be
    }
  }), kt = dp(Ut, {
    enabled: !x && !B,
    event: "mousedown"
  }), Ht = Cu(Ut), Dt = C0(Ut, {
    enabled: !x && !B,
    listRef: ae,
    activeIndex: oe,
    selectedIndex: pe,
    disabledIndices: Yl,
    onNavigate(Pe) {
      Pe === null && !ee || je.set("activeIndex", Pe);
    },
    focusItemOnHover: j
  }), Yt = O0(Ut, {
    enabled: !x && !B && (ee || !z),
    listRef: le,
    activeIndex: oe,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (Pe) => sx(ae.current[Pe]),
    onMatch(Pe) {
      ee ? je.set("activeIndex", Pe) : Qe(fe.current[Pe], Ge("none"));
    },
    onTyping(Pe) {
      ye.current = Pe;
    }
  }), bn = y.useMemo(() => {
    const Pe = Tn(Yt.reference, Dt.reference, Ht.reference, kt.reference, Oe);
    return K && (Pe.id = K), Pe;
  }, [kt.reference, Yt.reference, Dt.reference, Ht.reference, Oe, K]), An = y.useMemo(() => Tn(Du, Yt.floating, Dt.floating, Ht.floating), [Yt.floating, Dt.floating, Ht.floating]), Bn = Dt.item ?? Ot;
  Fd(() => {
    je.update({
      popupProps: An,
      triggerProps: bn
    });
  }), xe(() => {
    je.update({
      id: K,
      modal: S,
      multiple: z,
      value: H,
      open: ee,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: An,
      triggerProps: bn,
      items: O,
      itemToStringLabel: M,
      itemToStringValue: L,
      isItemEqualToValue: D,
      openMethod: We
    });
  }, [je, K, S, z, H, ee, Ce, Se, An, bn, O, M, L, D, We]);
  const Gt = y.useMemo(() => ({
    store: je,
    name: E,
    required: T,
    disabled: B,
    readOnly: x,
    multiple: z,
    highlightItemOnHover: j,
    setValue: Qe,
    setOpen: On,
    listRef: ae,
    popupRef: se,
    scrollHandlerRef: ge,
    handleScrollArrowVisibility: ft,
    scrollArrowsMountedCountRef: _e,
    itemProps: Bn,
    valueRef: Ee,
    valuesRef: fe,
    labelsRef: le,
    typingRef: ye,
    selectionRef: ke,
    firstItemTextRef: Te,
    selectedItemTextRef: He,
    validation: Y,
    onOpenChangeComplete: A,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: gt
  }), [je, E, T, B, x, z, j, Qe, On, Bn, Y, A, ft]), In = xo(R, Y.inputRef), gl = z && Array.isArray(H) && H.length > 0, Wn = z ? void 0 : E, ml = y.useMemo(() => !z || !Array.isArray(H) || !E ? null : H.map((Pe) => {
    const bt = Qo(Pe, L);
    return /* @__PURE__ */ k.jsx("input", {
      type: "hidden",
      form: d,
      name: E,
      value: bt,
      disabled: B
    }, bt);
  }), [z, H, d, E, L, B]);
  return /* @__PURE__ */ k.jsx(mx.Provider, {
    value: Gt,
    children: /* @__PURE__ */ k.jsxs(hx.Provider, {
      value: Ut,
      children: [_, /* @__PURE__ */ k.jsx("input", {
        ...Y.getValidationProps(B, {
          onFocus() {
            je.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              focusVisible: !0
            });
          },
          // Handle browser autofill.
          onChange(Pe) {
            if (Pe.nativeEvent.defaultPrevented || B || x)
              return;
            const bt = Pe.currentTarget.value, qt = Ge(Ro, Pe.nativeEvent);
            function en() {
              if (z)
                return;
              const Jt = bt.toLowerCase();
              let Rt = fe.current.findIndex((ll) => Qo(ll, L).toLowerCase() === Jt || vx(ll, M).toLowerCase() === Jt);
              Rt === -1 && (Rt = fe.current.findIndex((ll, la) => {
                const xi = le.current[la];
                return xi != null && xi.toLowerCase() === Jt;
              }));
              const an = Rt === -1 ? void 0 : fe.current[Rt];
              an != null && Qe(an, qt);
            }
            je.set("forceMount", !0), queueMicrotask(en);
          }
        }),
        id: K && Wn == null ? `${K}-hidden-input` : void 0,
        form: d,
        name: Wn,
        autoComplete: b,
        value: lt,
        disabled: B,
        required: T && !gl,
        readOnly: x,
        ref: In,
        style: E ? MR : Nv,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), ml]
    })
  });
}
function fM(n, r) {
  return n ?? r;
}
const Xs = 2, dM = 400, pM = {
  ...kd,
  ...dx,
  popupSide: (n) => n ? {
    "data-popup-side": n
  } : null,
  value: () => null
}, gM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    id: f,
    disabled: p = !1,
    nativeButton: g = !0,
    style: m,
    ...d
  } = r, {
    setTouched: b,
    setFocused: v,
    validationMode: x,
    state: T,
    disabled: S
  } = Iu(), {
    labelId: C
  } = jp(), {
    store: R,
    setOpen: A,
    selectionRef: O,
    validation: z,
    readOnly: M,
    required: L,
    alignItemWithTriggerActiveRef: D,
    disabled: j
  } = Xl(), _ = S || j || p, X = Ye(R, Ie.open), q = Ye(R, Ie.mounted), re = Ye(R, Ie.value), Q = Ye(R, Ie.triggerProps), J = Ye(R, Ie.positionerElement), Z = Ye(R, Ie.listElement), G = Ye(R, Ie.popupSide), N = Ye(R, Ie.id), Y = Ye(R, Ie.labelId), I = Ye(R, Ie.hasSelectedValue), K = q && J ? G : null, B = f ?? N, E = fM(C, Y);
  Up({
    id: B
  });
  const H = Vt(J), te = y.useRef(null), {
    getButtonProps: ee,
    buttonRef: ie
  } = lr({
    disabled: _,
    native: g
  }), ae = De((ye) => {
    R.set("triggerElement", ye);
  }), le = rn(), se = rn(), ge = rn();
  y.useEffect(() => {
    if (X)
      return ge.start(dM, () => {
        O.current.allowUnselectedMouseUp = !0, O.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    O.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [X, O, se, ge]);
  const _e = Tn(Q, {
    id: B,
    role: "combobox",
    "aria-expanded": X ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": X ? Z?.id ?? ou(J)?.id : void 0,
    "aria-labelledby": E,
    "aria-readonly": M || void 0,
    "aria-required": L || void 0,
    tabIndex: _ ? -1 : 0,
    onFocus(ye) {
      v(!0), X && D.current && A(!1, Ge(Ro, ye.nativeEvent)), le.start(0, () => {
        R.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(J, ye.relatedTarget) || (b(!0), v(!1), x === "onBlur" && z.commit(re));
    },
    onMouseDown(ye) {
      if (X)
        return;
      const Te = et(ye.currentTarget);
      function He(ke) {
        if (!te.current)
          return;
        const we = ke.target;
        if (Le(te.current, we) || Le(H.current, we))
          return;
        const Ce = rx(te.current);
        ke.clientX >= Ce.left - Xs && ke.clientX <= Ce.right + Xs && ke.clientY >= Ce.top - Xs && ke.clientY <= Ce.bottom + Xs || A(!1, Ge(Av, ke));
      }
      se.start(0, () => {
        Te.addEventListener("mouseup", He, {
          once: !0
        });
      });
    }
  }, d, ee), Ee = z.getValidationProps(_, _e);
  Ee.role = "combobox";
  const fe = {
    ...T,
    open: X,
    disabled: _,
    value: re,
    readOnly: M,
    popupSide: K,
    placeholder: !I
  };
  return it("button", r, {
    ref: [a, te, ie, ae],
    state: fe,
    stateAttributesMapping: pM,
    props: Ee
  });
}), mM = {
  value: () => null
}, hM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    className: i,
    render: c,
    children: f,
    placeholder: p,
    style: g,
    ...m
  } = r, {
    store: d,
    valueRef: b
  } = Xl(), v = Ye(d, Ie.value), x = Ye(d, Ie.items), T = Ye(d, Ie.itemToStringLabel), S = Ye(d, Ie.hasSelectedValue), C = !S && p != null && f == null, R = Ye(d, Ie.hasNullItemLabel, C), A = {
    value: v,
    placeholder: !S
  };
  let O = null;
  return typeof f == "function" ? O = f(v) : f != null ? O = f : !S && p != null && !R ? O = p : Array.isArray(v) ? O = iM(v, x, T) : O = xx(v, x, T), it("span", r, {
    state: A,
    ref: [a, b],
    props: [{
      children: O
    }, m],
    stateAttributesMapping: mM
  });
}), yM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, {
    store: g
  } = Xl(), d = {
    open: Ye(g, Ie.open)
  };
  return it("span", r, {
    state: d,
    ref: a,
    props: [{
      "aria-hidden": !0,
      children: "▼"
    }, p],
    stateAttributesMapping: Op
  });
}), bM = /* @__PURE__ */ y.createContext(void 0), vM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    store: i
  } = Xl(), c = Ye(i, Ie.mounted), f = Ye(i, Ie.forceMount);
  return c || f ? /* @__PURE__ */ k.jsx(bM.Provider, {
    value: !0,
    children: /* @__PURE__ */ k.jsx(sp, {
      ref: a,
      ...r
    })
  }) : null;
}), wx = /* @__PURE__ */ y.createContext(void 0);
function Ex() {
  const n = y.useContext(wx);
  if (!n)
    throw new Error(Lt(59));
  return n;
}
function gu(n, r) {
  n && Object.assign(n.style, r);
}
const Rx = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
}, xM = {
  position: "fixed"
}, SM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    anchor: i,
    positionMethod: c = "absolute",
    className: f,
    render: p,
    side: g = "bottom",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: b = 0,
    collisionBoundary: v = "clipping-ancestors",
    collisionPadding: x,
    arrowPadding: T = 5,
    sticky: S = !1,
    disableAnchorTracking: C,
    alignItemWithTrigger: R = !0,
    collisionAvoidance: A = Xv,
    style: O,
    ...z
  } = r, {
    store: M,
    listRef: L,
    labelsRef: D,
    alignItemWithTriggerActiveRef: j,
    selectedItemTextRef: _,
    valuesRef: X,
    initialValueRef: q,
    popupRef: re,
    setValue: Q
  } = Xl(), J = yx(), Z = Ye(M, Ie.open), G = Ye(M, Ie.mounted), N = Ye(M, Ie.modal), Y = Ye(M, Ie.value), I = Ye(M, Ie.openMethod), K = Ye(M, Ie.positionerElement), B = Ye(M, Ie.triggerElement), E = Ye(M, Ie.isItemEqualToValue), H = Ye(M, Ie.transitionStatus), te = y.useRef(null), ee = y.useRef(null), [ie, ae] = y.useState(R), le = G && ie && I !== "touch";
  !G && ie !== R && ae(R), xe(() => {
    G || (Ie.scrollUpArrowVisible(M.state) && M.set("scrollUpArrowVisible", !1), Ie.scrollDownArrowVisible(M.state) && M.set("scrollDownArrowVisible", !1));
  }, [M, G]), y.useImperativeHandle(j, () => le), ex((le || N) && Z, I === "touch", K, B);
  const se = Np({
    anchor: i,
    floatingRootContext: J,
    positionMethod: c,
    mounted: G,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: b,
    arrowPadding: T,
    collisionBoundary: v,
    collisionPadding: x,
    sticky: S,
    disableAnchorTracking: C ?? le,
    collisionAvoidance: A,
    keepMounted: !0
  }), ge = le ? "none" : se.side, _e = le ? xM : se.positionerStyles, Ee = {
    open: Z,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    M.set("popupSide", se.side);
  }, [M, se.side]);
  const fe = De((we) => {
    M.set("positionerElement", we);
  }), ye = kp(r, Ee, {
    styles: _e,
    transitionStatus: H,
    props: z,
    refs: [a, fe],
    hidden: !G,
    inert: !Z
  }), Te = y.useRef(0), He = De((we) => {
    if (we.size === 0 && Te.current === 0 || X.current.length === 0)
      return;
    const Ce = Te.current;
    if (Te.current = we.size, we.size === Ce)
      return;
    const he = Ge(Ro);
    if (Ce !== 0 && !M.state.multiple && Y !== null && ui(X.current, Y, E) === -1) {
      const Re = q.current, je = Re != null && ui(X.current, Re, E) !== -1 ? Re : null;
      Q(je, he), je === null && (M.set("selectedIndex", null), _.current = null);
    }
    if (Ce !== 0 && M.state.multiple && Array.isArray(Y)) {
      const Se = (Oe) => ui(X.current, Oe, E) !== -1, Re = Y.filter((Oe) => Se(Oe));
      (Re.length !== Y.length || Re.some((Oe) => !oM(Y, Oe, E))) && (Q(Re, he), Re.length === 0 && (M.set("selectedIndex", null), _.current = null));
    }
    if (Z && le) {
      M.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      gu(K, Se), gu(re.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: le,
    setControlledAlignItemWithTrigger: ae,
    scrollUpArrowRef: te,
    scrollDownArrowRef: ee
  }), [se, ge, le, ae]);
  return /* @__PURE__ */ k.jsx(_p, {
    elementsRef: L,
    labelsRef: D,
    onMapChange: He,
    children: /* @__PURE__ */ k.jsxs(wx.Provider, {
      value: ke,
      children: [G && N && /* @__PURE__ */ k.jsx(Ap, {
        inert: Mp(!Z),
        cutout: B
      }), ye]
    })
  });
}), Ks = "base-ui-disable-scrollbar", Ld = {
  className: Ks,
  getElement(n) {
    return /* @__PURE__ */ k.jsx("style", {
      nonce: n,
      href: Ks,
      precedence: "base-ui:low",
      children: `.${Ks}{scrollbar-width:none}.${Ks}::-webkit-scrollbar{display:none}`
    });
  }
}, wM = /* @__PURE__ */ y.createContext(void 0), EM = {
  disableStyleElements: !1
};
function RM() {
  return y.useContext(wM) ?? EM;
}
const TM = {
  ...ir,
  ...rr
}, CM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    finalFocus: p,
    ...g
  } = r, {
    store: m,
    popupRef: d,
    onOpenChangeComplete: b,
    setOpen: v,
    valueRef: x,
    firstItemTextRef: T,
    selectedItemTextRef: S,
    multiple: C,
    handleScrollArrowVisibility: R,
    scrollHandlerRef: A,
    listRef: O,
    highlightItemOnHover: z
  } = Xl(), {
    side: M,
    align: L,
    alignItemWithTriggerActive: D,
    isPositioned: j,
    setControlledAlignItemWithTrigger: _
  } = Ex(), X = Dp() != null, q = yx(), re = Bu(), {
    nonce: Q,
    disableStyleElements: J
  } = RM(), Z = Ye(m, Ie.id), G = Ye(m, Ie.open), N = Ye(m, Ie.openMethod), Y = Ye(m, Ie.mounted), I = Ye(m, Ie.popupProps), K = Ye(m, Ie.transitionStatus), B = Ye(m, Ie.triggerElement), E = Ye(m, Ie.positionerElement), H = Ye(m, Ie.listElement), te = y.useRef(!1), ee = y.useRef(!1), ie = y.useRef({}), ae = Jr(), le = De((Ee) => {
    if (!E || !d.current || !ee.current)
      return;
    if (te.current || !D) {
      R();
      return;
    }
    const fe = E.style.top === "0px", ye = E.style.bottom === "0px";
    if (!fe && !ye) {
      R();
      return;
    }
    const Te = Gb(E), He = oi(E.getBoundingClientRect().height, "y", Te), ke = et(E), we = At(E), Ce = we.getComputedStyle(E), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Re = Yb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Re), je = Ee.scrollTop, oe = Qs(Ee);
    let pe = 0, Ue = null, be = !1, ve = !1;
    const We = ($e) => {
      E.style.height = `${$e}px`;
    }, lt = ($e, gt) => {
      const Mt = li($e, 0, Oe - He);
      Mt > 0 && We(He + Mt), Ee.scrollTop = gt, Oe - (He + Mt) <= jl && (te.current = !0), R();
    }, pt = fe ? oe - je : je, zt = Math.min(He + pt, Oe);
    if (pe = zt, pt <= jl) {
      lt(pt, fe ? oe : 0);
      return;
    }
    if (Oe - zt > jl)
      fe ? ve = !0 : Ue = 0;
    else if (be = !0, ye && je < oe) {
      const $e = He + pt - Oe;
      Ue = je - (pt - $e);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), ve || Ue != null) {
      const $e = Qs(Ee), gt = ve ? $e : li(Ue, 0, $e);
      Math.abs(Ee.scrollTop - gt) > jl && (Ee.scrollTop = gt);
    }
    (be || pe >= Oe - jl) && (te.current = !0), R();
  });
  y.useImperativeHandle(A, () => le, [le]), Mo({
    open: G,
    ref: d,
    onComplete() {
      G && b?.(!0);
    }
  });
  const se = {
    open: G,
    transitionStatus: K,
    side: M,
    align: L
  };
  xe(() => {
    !E || !d.current || Object.keys(ie.current).length || (ie.current = {
      top: E.style.top || "0",
      left: E.style.left || "0",
      right: E.style.right,
      height: E.style.height,
      bottom: E.style.bottom,
      minHeight: E.style.minHeight,
      maxHeight: E.style.maxHeight,
      marginTop: E.style.marginTop,
      marginBottom: E.style.marginBottom
    });
  }, [d, E]), xe(() => {
    G || D || (ee.current = !1, te.current = !1, gu(E, ie.current));
  }, [G, D, E, d]), xe(() => {
    const Ee = d.current;
    if (!G || !B || !E || !Ee || D && !j || m.state.transitionStatus === "ending")
      return;
    if (!D) {
      ee.current = !0, ae.request(R), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = OM(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = S.current;
      ye?.isConnected || (ye = !Ie.hasSelectedValue(m.state) && T.current?.isConnected ? T.current : null);
      const Te = x.current, He = At(E), ke = He.getComputedStyle(E), we = He.getComputedStyle(Ee), Ce = et(B), he = Gb(B), Se = Zs(B.getBoundingClientRect(), he), Re = Zs(E.getBoundingClientRect(), he), Oe = Se.height, je = H || Ee, oe = je.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, be = parseFloat(ke.marginBottom) || 10, ve = parseFloat(ke.minHeight) || 100, We = Yb(we), lt = 5, pt = 5, zt = 20, $e = Ce.documentElement.clientHeight - Ue - be, gt = Ce.documentElement.clientWidth, Mt = $e - Se.bottom + Oe;
      let mt, On = re === "rtl" ? Se.right - Re.width : Se.left, Mn = 0;
      if (ye && Te) {
        const Gt = Zs(Te.getBoundingClientRect(), he);
        mt = Zs(ye.getBoundingClientRect(), he), On = Re.left + (re === "rtl" ? Gt.right - mt.right : Gt.left - mt.left);
        const In = Gt.top - Se.top + Gt.height / 2;
        Mn = mt.top - Re.top + mt.height / 2 - In;
      }
      const Qe = Mt + Mn + be + pe;
      let ft = Math.min($e, Qe);
      const Ut = $e - Ue - be, kt = Qe - ft, Ht = gt - pt;
      E.style.left = `${li(On, lt, Ht - Re.width)}px`, E.style.height = `${ft}px`, E.style.maxHeight = "none", E.style.marginTop = `${Ue}px`, E.style.marginBottom = `${be}px`, Ee.style.height = "100%";
      const Dt = Qs(je), Yt = kt >= Dt - jl;
      Yt && (ft = Math.min($e, Re.height) - (kt - Dt));
      const bn = Se.top < zt || Se.bottom > $e - zt || Math.ceil(ft) + jl < Math.min(oe, ve), An = (He.visualViewport?.scale ?? 1) !== 1 && Eo;
      if (bn || An) {
        ee.current = !0, gu(E, ie.current), _(!1);
        return;
      }
      const Bn = Math.max(ve, ft);
      if (Yt) {
        const Gt = Math.max(0, $e - Qe);
        E.style.top = Re.height >= Ut ? "0" : `${Gt}px`, E.style.height = `${ft}px`, je.scrollTop = Qs(je);
      } else
        E.style.bottom = "0", je.scrollTop = kt;
      if (mt) {
        const Gt = Re.top, In = Re.height, gl = mt.top + mt.height / 2, Wn = In > 0 ? (gl - Gt) / In * 100 : 50, ml = li(Wn, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${ml}%`);
      }
      (Bn === $e || ft >= We) && (te.current = !0), R(), z && m.state.selectedIndex === null && m.state.activeIndex === null && O.current[0] != null && m.set("activeIndex", 0), ee.current = !0;
    } finally {
      fe();
    }
  }, [m, G, E, B, x, T, S, d, R, D, _, ae, H, O, z, re, j]), y.useEffect(() => {
    if (!D || !E || !G)
      return;
    const Ee = At(E);
    function fe(ye) {
      v(!1, Ge(ER, ye));
    }
    return Fe(Ee, "resize", fe);
  }, [v, D, E, G]);
  const ge = {
    ...H ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": C || void 0,
      id: `${Z}-list`
    },
    onKeyDown(Ee) {
      X && Hu.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      H || le(Ee.currentTarget);
    },
    ...D && {
      style: H ? {
        height: "100%"
      } : Rx
    }
  }, _e = it("div", r, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: TM,
    props: [I, ge, Lu(K), {
      className: !H && D ? Ld.className : void 0
    }, g]
  });
  return /* @__PURE__ */ k.jsxs(y.Fragment, {
    children: [!J && Ld.getElement(Q), /* @__PURE__ */ k.jsx(fp, {
      context: q,
      modal: !1,
      disabled: !Y,
      openInteractionType: N,
      returnFocus: p,
      restoreFocus: !0,
      children: _e
    })]
  });
});
function Yb(n) {
  const r = n.maxHeight || "";
  return r.endsWith("px") && parseFloat(r) || 1 / 0;
}
function Qs(n) {
  return Sx(n.scrollHeight, n.clientHeight);
}
function Gb(n) {
  return a0.getScale(n);
}
function oi(n, r, a) {
  return n / a[r];
}
function Zs(n, r) {
  return di({
    x: oi(n.x, "x", r),
    y: oi(n.y, "y", r),
    width: oi(n.width, "x", r),
    height: oi(n.height, "y", r)
  });
}
const qb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function OM(n) {
  const {
    style: r
  } = n, a = {};
  for (const [i, c] of qb)
    a[i] = r.getPropertyValue(i), r.setProperty(i, c, "important");
  return () => {
    for (const [i] of qb) {
      const c = a[i];
      c ? r.setProperty(i, c) : r.removeProperty(i);
    }
  };
}
const MM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, {
    store: g,
    scrollHandlerRef: m
  } = Xl(), {
    alignItemWithTriggerActive: d
  } = Ex(), b = Ye(g, Ie.hasScrollArrows), v = Ye(g, Ie.openMethod), x = Ye(g, Ie.multiple), S = {
    id: `${Ye(g, Ie.id)}-list`,
    role: "listbox",
    "aria-multiselectable": x || void 0,
    onScroll(R) {
      m.current?.(R.currentTarget);
    },
    ...d && {
      style: Rx
    },
    className: b && v !== "touch" ? Ld.className : void 0
  }, C = De((R) => {
    g.set("listElement", R);
  });
  return it("div", r, {
    ref: [a, C],
    props: [S, p]
  });
}), Tx = /* @__PURE__ */ y.createContext(void 0);
function Lp() {
  const n = y.useContext(Tx);
  if (!n)
    throw new Error(Lt(57));
  return n;
}
const AM = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    value: p = null,
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...b
  } = r, v = y.useRef(null), x = bi({
    label: g,
    textRef: v,
    indexGuessBehavior: Q0.GuessFromOrder
  }), {
    store: T,
    itemProps: S,
    setOpen: C,
    setValue: R,
    selectionRef: A,
    typingRef: O,
    valuesRef: z,
    multiple: M,
    selectedItemTextRef: L,
    disabled: D,
    readOnly: j
  } = Xl(), _ = Ye(T, Ie.isActive, x.index), X = Ye(T, Ie.open), q = Ye(T, Ie.isSelected, p), re = Ye(T, Ie.isSelectedByFocus, x.index), Q = Ye(T, Ie.isItemEqualToValue), J = x.index, Z = J !== -1, G = y.useRef(null);
  xe(() => {
    if (!Z)
      return;
    const le = z.current;
    return le[J] = p, () => {
      delete le[J];
    };
  }, [Z, J, p, z]), xe(() => {
    if (!Z)
      return;
    const le = T.state.value;
    let se = le;
    M && Array.isArray(le) && (se = le.length > 0 ? le[le.length - 1] : void 0), se !== void 0 && tr(p, se, Q) && (T.set("selectedIndex", J), v.current && (L.current = v.current));
  }, [Z, J, M, Q, T, p, L]);
  const N = y.useRef(null), Y = y.useRef("mouse"), I = y.useRef(!1), {
    getButtonProps: K,
    buttonRef: B
  } = lr({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), E = {
    disabled: m,
    selected: q,
    highlighted: _
  };
  function H(le) {
    if (D || j)
      return;
    const se = T.state.value;
    if (M) {
      const ge = Array.isArray(se) ? se : [], _e = q ? rM(ge, p, Q) : [...ge, p];
      R(_e, Ge(Kr, le));
    } else
      R(p, Ge(Kr, le)), C(!1, Ge(Kr, le));
  }
  function te() {
    A.current.dragY = 0;
  }
  const ee = {
    role: "option",
    "aria-selected": q,
    tabIndex: X && _ ? 0 : -1,
    onKeyDown(le) {
      N.current = le.key, T.set("activeIndex", J), le.key === " " && O.current && le.preventDefault();
    },
    onClick(le) {
      const se = le.type === "click" && Y.current !== "touch", ge = le.nativeEvent.pointerType, _e = se && ep(le.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || _), Ee = se && !_e && !I.current;
      I.current = !1, !(le.type === "keydown" && N.current === null) && (m || le.type === "keydown" && N.current === " " && O.current || Ee || (N.current = null, H(le.nativeEvent)));
    },
    onPointerEnter(le) {
      Y.current = le.pointerType;
    },
    onPointerMove(le) {
      if (le.pointerType === "mouse" && le.buttons === 1) {
        const se = A.current;
        se.dragY += le.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(le) {
      Y.current = le.pointerType, I.current = !0, te();
    },
    onMouseUp() {
      if (te(), m || Y.current === "touch" || I.current)
        return;
      const le = !A.current.allowSelectedMouseUp && q, se = !A.current.allowUnselectedMouseUp && !q;
      le || se || (I.current = !0, G.current?.click(), I.current = !1);
    }
  }, ie = it("div", r, {
    ref: [B, a, x.ref, G],
    state: E,
    props: [S, ee, b, K]
  }), ae = y.useMemo(() => ({
    selected: q,
    index: J,
    textRef: v,
    selectedByFocus: re,
    hasRegistered: Z
  }), [q, J, v, re, Z]);
  return /* @__PURE__ */ k.jsx(Tx.Provider, {
    value: ae,
    children: ie
  });
})), zM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const i = r.keepMounted ?? !1, {
    selected: c
  } = Lp();
  return i || c ? /* @__PURE__ */ k.jsx(DM, {
    ...r,
    ref: a
  }) : null;
}), DM = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef((n, r) => {
  const {
    render: a,
    className: i,
    style: c,
    keepMounted: f,
    ...p
  } = n, {
    selected: g
  } = Lp(), m = y.useRef(null), {
    transitionStatus: d,
    setMounted: b
  } = zu(g), x = it("span", n, {
    ref: [r, m],
    state: {
      selected: g,
      transitionStatus: d
    },
    props: [{
      "aria-hidden": !0,
      children: "✔️"
    }, p],
    stateAttributesMapping: rr
  });
  return Mo({
    open: g,
    ref: m,
    onComplete() {
      g || b(!1);
    }
  }), x;
})), NM = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    index: i,
    textRef: c,
    selectedByFocus: f,
    hasRegistered: p
  } = Lp(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Xl(), {
    render: d,
    className: b,
    style: v,
    ...x
  } = r, T = y.useCallback((C) => {
    C && (p && i === 0 && (g.current = C), p && f && (m.current = C));
  }, [g, m, i, f, p]);
  return it("div", r, {
    ref: [T, a, c],
    props: x
  });
})), _M = /* @__PURE__ */ y.createContext(void 0), kM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, [g, m] = y.useState(), d = y.useMemo(() => ({
    labelId: g,
    setLabelId: m
  }), [g, m]), b = it("div", r, {
    ref: a,
    props: [{
      role: "group",
      "aria-labelledby": g
    }, p]
  });
  return /* @__PURE__ */ k.jsx(_M.Provider, {
    value: d,
    children: b
  });
});
function HM({ ...n }) {
  return /* @__PURE__ */ k.jsx(cM, { "data-slot": "select", ...n });
}
function jM({ ...n }) {
  return /* @__PURE__ */ k.jsx(kM, { "data-slot": "select-group", ...n });
}
function UM({ ...n }) {
  return /* @__PURE__ */ k.jsx(hM, { "data-slot": "select-value", ...n });
}
function LM({
  className: n,
  size: r = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ k.jsxs(
    gM,
    {
      "data-slot": "select-trigger",
      "data-size": r,
      className: st(
        "tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-[var(--radius-control)] tw:border tw:border-input tw:bg-background tw:text-[var(--fs-body-s)] tw:text-foreground tw:whitespace-nowrap tw:outline-none tw:focus-visible:border-ring tw:focus-visible:ring-2 tw:focus-visible:ring-ring/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[size=default]:h-8 tw:data-[size=sm]:h-7 tw:data-[size=default]:px-2.5 tw:data-[size=sm]:px-2 tw:data-[placeholder]:text-muted-foreground",
        n
      ),
      ...i,
      children: [
        a,
        /* @__PURE__ */ k.jsx(yM, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ k.jsx(cE, {}) })
      ]
    }
  );
}
function BM({
  className: n,
  children: r,
  portalContainer: a,
  positionerClassName: i,
  ...c
}) {
  return /* @__PURE__ */ k.jsx(vM, { container: a, children: /* @__PURE__ */ k.jsx(
    SM,
    {
      sideOffset: 4,
      className: st("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ k.jsx(
        CM,
        {
          "data-slot": "select-content",
          className: st(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:outline-none",
            n
          ),
          ...c,
          children: /* @__PURE__ */ k.jsx(MM, { className: "tw:flex tw:flex-col tw:gap-0.5", children: r })
        }
      )
    }
  ) });
}
function IM({ className: n, children: r, ...a }) {
  return /* @__PURE__ */ k.jsxs(
    AM,
    {
      "data-slot": "select-item",
      className: st(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ k.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ k.jsx(zM, { children: /* @__PURE__ */ k.jsx(Wb, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ k.jsx(NM, { children: r })
      ]
    }
  );
}
function VM(n) {
  const r = y.useContext(M0) ? "drawer" : "dialog";
  return z0(n, r);
}
function YM({ ...n }) {
  return /* @__PURE__ */ k.jsx(VM, { "data-slot": "sheet", ...n });
}
function GM({ ...n }) {
  return /* @__PURE__ */ k.jsx(B0, { "data-slot": "sheet-portal", ...n });
}
function qM({ className: n, ...r }) {
  return /* @__PURE__ */ k.jsx(
    D0,
    {
      "data-slot": "sheet-overlay",
      className: st(
        "tw:fixed tw:inset-0 tw:z-[var(--z-modal)] tw:bg-black/10 tw:duration-[var(--motion-panel)] tw:supports-backdrop-filter:backdrop-blur-xs",
        n
      ),
      ...r
    }
  );
}
function PM({
  className: n,
  children: r,
  side: a = "right",
  layer: i = "modal",
  showCloseButton: c = !0,
  showOverlay: f = !0,
  ...p
}) {
  return /* @__PURE__ */ k.jsxs(GM, { children: [
    f && /* @__PURE__ */ k.jsx(qM, {}),
    /* @__PURE__ */ k.jsxs(
      L0,
      {
        "data-slot": "sheet-content",
        "data-side": a,
        "data-layer": i,
        className: st(
          "tw:fixed tw:flex tw:flex-col tw:gap-4 tw:bg-popover tw:bg-clip-padding tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-lg tw:transition-[opacity,transform] tw:duration-[var(--motion-panel)] tw:ease-[var(--ease-out)] tw:data-[layer=panel]:z-[var(--z-sticky)] tw:data-[layer=modal]:z-[var(--z-modal)] tw:data-[side=bottom]:inset-x-0 tw:data-[side=bottom]:bottom-0 tw:data-[side=bottom]:h-auto tw:data-[side=bottom]:border-t tw:data-[side=bottom]:data-ending-style:translate-y-full tw:data-[side=bottom]:data-starting-style:translate-y-full tw:data-[side=left]:inset-y-0 tw:data-[side=left]:left-0 tw:data-[side=left]:h-full tw:data-[side=left]:w-3/4 tw:data-[side=left]:border-r tw:data-[side=left]:data-ending-style:-translate-x-full tw:data-[side=left]:data-starting-style:-translate-x-full tw:data-[side=right]:inset-y-0 tw:data-[side=right]:right-0 tw:data-[side=right]:h-full tw:data-[side=right]:w-3/4 tw:data-[side=right]:border-l tw:data-[side=right]:data-ending-style:translate-x-full tw:data-[side=right]:data-starting-style:translate-x-full tw:data-[side=top]:inset-x-0 tw:data-[side=top]:top-0 tw:data-[side=top]:h-auto tw:data-[side=top]:border-b tw:data-[side=top]:data-ending-style:-translate-y-full tw:data-[side=top]:data-starting-style:-translate-y-full tw:data-[side=left]:sm:max-w-sm tw:data-[side=right]:sm:max-w-sm",
          n
        ),
        ...p,
        children: [
          r,
          c && /* @__PURE__ */ k.jsxs(
            N0,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ k.jsx(
                Zo,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ k.jsx(_E, {}),
                /* @__PURE__ */ k.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function XM({ className: n, ...r }) {
  return /* @__PURE__ */ k.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: st("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...r
    }
  );
}
function KM({ className: n, ...r }) {
  return /* @__PURE__ */ k.jsx(
    I0,
    {
      "data-slot": "sheet-title",
      className: st(
        "tw:text-[var(--fs-title)] tw:font-medium tw:text-foreground",
        n
      ),
      ...r
    }
  );
}
function QM({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    _0,
    {
      "data-slot": "sheet-description",
      className: st("tw:text-[var(--fs-body-s)] tw:text-muted-foreground", n),
      ...r
    }
  );
}
const Cx = /* @__PURE__ */ y.createContext(void 0);
function ZM(n = !0) {
  const r = y.useContext(Cx);
  if (r === void 0 && !n)
    throw new Error(Lt(7));
  return r;
}
const FM = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    className: i,
    defaultPressed: c = !1,
    disabled: f = !1,
    form: p,
    // never participates in form validation
    onPressedChange: g,
    pressed: m,
    render: d,
    type: b,
    // cannot change button type
    value: v,
    nativeButton: x = !0,
    style: T,
    ...S
  } = r, C = dl(v || void 0), R = ZM(), A = R?.value ?? [], O = R ? void 0 : c, z = (f || R?.disabled) ?? !1, [M, L] = ta({
    controlled: R ? C !== void 0 && A.indexOf(C) > -1 : m,
    default: O,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: D,
    buttonRef: j
  } = lr({
    disabled: z,
    native: x
  }), _ = {
    disabled: z,
    pressed: M
  }, X = [j, a], q = [{
    "aria-pressed": M,
    onClick(J) {
      const Z = !M, G = Ge(Ro, J.nativeEvent);
      g?.(Z, G), !G.isCanceled && (C && R?.setGroupValue?.(C, Z, G), !G.isCanceled && L(Z));
    }
  }, S, D], re = it("button", r, {
    enabled: !R,
    state: _,
    ref: X,
    props: q
  }), Q = y.useMemo(() => ({
    disabled: z,
    focusableWhenDisabled: !1
  }), [z]);
  return R ? /* @__PURE__ */ k.jsx(ax, {
    tag: "button",
    render: d,
    className: i,
    style: T,
    metadata: Q,
    state: _,
    refs: X,
    props: q
  }) : re;
}), JM = "data-composite-item-active", WM = [];
function $M(n) {
  const {
    loopFocus: r = !0,
    orientation: a = "both",
    grid: i,
    onLoop: c,
    direction: f,
    highlightedIndex: p,
    onHighlightedIndexChange: g,
    rootRef: m,
    enableHomeAndEndKeys: d = !1,
    stopEventPropagation: b = !1,
    disabledIndices: v,
    modifierKeys: x = WM
  } = n, [T, S] = y.useState(0), C = i != null, R = y.useRef(null), A = xo(R, m), O = y.useRef([]), z = y.useRef(!1), M = p ?? T, L = De((q, re = !1) => {
    if ((g ?? S)(q), re) {
      const Q = O.current[q];
      _b(R.current, Q, f, a);
    }
  }), D = De((q) => {
    if (q.size === 0 || z.current)
      return;
    z.current = !0;
    const re = Array.from(q.keys()), Q = re.find((Z) => Z?.hasAttribute(JM)) ?? null, J = Q ? re.indexOf(Q) : -1;
    if (J !== -1)
      L(J);
    else if (iu(re, M, v)) {
      const Z = Ul(re, {
        disabledIndices: v
      });
      ri(re, Z) || L(Z);
    }
    _b(R.current, Q, f, a);
  });
  xe(() => {
    if (v == null || p != null || !z.current)
      return;
    const q = O.current;
    if (iu(q, M, v)) {
      const re = Ul(q, {
        disabledIndices: v
      });
      ri(q, re) || L(re);
    }
  }, [v, p, M, O, L]);
  const j = De((q, re, Q) => c ? c(q, re, Q, O) : Q), _ = De((q) => {
    const re = d ? Hu : U0;
    if (!re.has(q.key) || e2(q, x) || !R.current)
      return;
    const J = f === "rtl", Z = J ? du : pu, G = {
      horizontal: Z,
      vertical: si,
      both: Z
    }[a], N = J ? pu : du, Y = {
      horizontal: N,
      vertical: ii,
      both: N
    }[a], I = dn(q.nativeEvent);
    if (I != null && Nb(I) && !sx(I)) {
      const ie = I.selectionStart, ae = I.selectionEnd, le = I.value ?? "";
      if (ie == null || q.shiftKey || ie !== ae || q.key !== Y && ie < le.length || q.key !== G && ie > 0)
        return;
    }
    let K = M;
    const B = Fs(O, v), E = Ad(O, v);
    i != null && (K = i({
      disabledIndices: v,
      elementsRef: O,
      event: q,
      highlightedIndex: M,
      loopFocus: r,
      maxIndex: E,
      minIndex: B,
      onLoop: j,
      orientation: a,
      rtl: J
    }));
    const H = {
      horizontal: [Z],
      vertical: [si],
      both: [Z, si]
    }[a], te = {
      horizontal: [N],
      vertical: [ii],
      both: [N, ii]
    }[a], ee = C ? re : {
      horizontal: d ? LC : H0,
      vertical: d ? BC : j0,
      both: re
    }[a];
    d && (q.key === _u ? K = B : q.key === ku && (K = E)), K === M && (H.includes(q.key) || te.includes(q.key)) && (r && K === E && H.includes(q.key) ? (K = B, c && (K = c(q, M, K, O))) : r && K === B && te.includes(q.key) ? (K = E, c && (K = c(q, M, K, O))) : K = Ul(O.current, {
      startingIndex: K,
      decrement: te.includes(q.key),
      disabledIndices: v
    })), K !== M && !ri(O.current, K) && (b && q.stopPropagation(), ee.has(q.key) && q.preventDefault(), L(K, !0), queueMicrotask(() => {
      O.current[K]?.focus();
    }));
  });
  return {
    props: {
      ref: A,
      onFocus(q) {
        const re = R.current, Q = dn(q.nativeEvent);
        !re || Q == null || !Nb(Q) || Q.setSelectionRange(0, Q.value.length ?? 0);
      },
      onKeyDown: _
    },
    highlightedIndex: M,
    onHighlightedIndexChange: L,
    elementsRef: O,
    disabledIndices: v,
    onMapChange: D,
    relayKeyboardEvent: _
  };
}
function e2(n, r) {
  for (const a of qC.values())
    if (!r.includes(a) && n.getModifierState(a))
      return !0;
  return !1;
}
function t2(n) {
  const {
    render: r,
    className: a,
    style: i,
    refs: c = Yl,
    props: f = Yl,
    state: p = Ot,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: b,
    grid: v,
    loopFocus: x,
    onLoop: T,
    enableHomeAndEndKeys: S,
    onMapChange: C,
    stopEventPropagation: R = !0,
    rootRef: A,
    disabledIndices: O,
    modifierKeys: z,
    highlightItemOnHover: M = !1,
    tag: L = "div",
    ...D
  } = n, j = Bu(), {
    props: _,
    highlightedIndex: X,
    onHighlightedIndexChange: q,
    elementsRef: re,
    onMapChange: Q,
    relayKeyboardEvent: J
  } = $M({
    grid: v,
    loopFocus: x,
    onLoop: T,
    orientation: b,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: A,
    stopEventPropagation: R,
    enableHomeAndEndKeys: S,
    direction: j,
    disabledIndices: O,
    modifierKeys: z
  }), Z = it(L, n, {
    state: p,
    ref: c,
    props: [_, ...f, D],
    stateAttributesMapping: g
  }), G = y.useMemo(() => ({
    highlightedIndex: X,
    onHighlightedIndexChange: q,
    highlightItemOnHover: M,
    relayKeyboardEvent: J
  }), [X, q, M, J]);
  return /* @__PURE__ */ k.jsx(rv.Provider, {
    value: G,
    children: /* @__PURE__ */ k.jsx(_p, {
      elementsRef: re,
      onMapChange: (N) => {
        C?.(N), Q(N);
      },
      children: Z
    })
  });
}
const n2 = /* @__PURE__ */ y.createContext(void 0);
function l2(n) {
  return y.useContext(n2);
}
let o2 = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.orientation = "data-orientation", n.multiple = "data-multiple", n;
})({});
const Pb = {
  multiple(n) {
    return n ? {
      [o2.multiple]: ""
    } : null;
  }
}, r2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    defaultValue: i,
    disabled: c = !1,
    loopFocus: f = !0,
    onValueChange: p,
    orientation: g = "horizontal",
    multiple: m = !1,
    value: d,
    className: b,
    render: v,
    style: x,
    ...T
  } = r, S = Dp(), C = l2(), R = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), A = (S?.disabled ?? !1) || (C?.disabled ?? !1) || c, [O, z] = ta({
    controlled: d,
    default: d === void 0 ? i ?? Yl : void 0,
    name: "ToggleGroup",
    state: "value"
  }), M = De((X, q, re) => {
    let Q;
    m ? (Q = O.slice(), q ? Q.push(X) : Q.splice(O.indexOf(X), 1)) : Q = q ? [X] : [], p?.(Q, re), !re.isCanceled && z(Q);
  }), L = {
    disabled: A,
    multiple: m,
    orientation: g
  }, D = y.useMemo(() => ({
    disabled: A,
    orientation: g,
    setGroupValue: M,
    value: O,
    isValueInitialized: R
  }), [A, g, M, O, R]), j = {
    role: "group"
  }, _ = it("div", r, {
    enabled: !!S,
    state: L,
    ref: a,
    props: [j, T],
    stateAttributesMapping: Pb
  });
  return /* @__PURE__ */ k.jsx(Cx.Provider, {
    value: D,
    children: S ? _ : /* @__PURE__ */ k.jsx(t2, {
      render: v,
      className: b,
      style: x,
      state: L,
      refs: [a],
      props: [j, T],
      stateAttributesMapping: Pb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), a2 = Kd(
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
function i2({
  className: n,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    r2,
    {
      "data-slot": "toggle-group",
      className: st("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...r
    }
  );
}
function vd({
  className: n,
  variant: r = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ k.jsx(
    FM,
    {
      type: "button",
      "data-slot": "toggle-group-item",
      className: st(a2({ variant: r, size: a }), n),
      ...i
    }
  );
}
function s2({ className: n, ...r }) {
  return /* @__PURE__ */ k.jsx(xE, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: st("tw:size-4 tw:animate-spin", n), ...r });
}
const Ox = /* @__PURE__ */ y.createContext(void 0);
function vi(n) {
  const r = y.useContext(Ox);
  if (r === void 0 && !n)
    throw new Error(Lt(72));
  return r;
}
const u2 = {
  ...Sp,
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
class Bp extends Mu {
  constructor(r, a, i = !1) {
    const c = new yi(), f = {
      ...c2(),
      ...r
    };
    f.floatingRootContext = x0(c, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerElements: c
    }, u2);
  }
  setOpen = (r, a) => {
    pC(this, r, a, {
      extraState: {
        openChangeReason: a.reason
      }
    });
  };
  // Used by trigger clicks to clear a delayed hover open without reporting a public open-state change.
  cancelPendingOpen(r) {
    this.state.floatingRootContext.dispatchOpenChange(!1, Ge(na, r));
  }
  static useStore(r, a) {
    return m0(r, (c, f) => new Bp(a, c, f)).store;
  }
}
function c2() {
  return {
    ...vp(),
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
const f2 = gp(function(r) {
  const {
    disabled: a = !1,
    defaultOpen: i = !1,
    open: c,
    disableHoverablePopup: f = !1,
    trackCursorAxis: p = "none",
    actionsRef: g,
    onOpenChange: m,
    onOpenChangeComplete: d,
    handle: b,
    triggerId: v,
    defaultTriggerId: x = null,
    children: T
  } = r, S = Bp.useStore(b?.store, {
    open: i,
    openProp: c,
    activeTriggerId: x,
    triggerIdProp: v
  });
  b0(S, c, i, x), S.useControlledProp("openProp", c), S.useControlledProp("triggerIdProp", v), S.useContextCallback("onOpenChange", m), S.useContextCallback("onOpenChangeComplete", d);
  const C = S.useState("open"), R = !a && C, A = S.useState("activeTriggerId"), O = S.useState("mounted"), z = S.useState("payload");
  S.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), S.useSyncedValue("disabled", a), hp(S, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: M,
    transitionStatus: L
  } = yp(R, S), D = S.useState("isInstantPhase"), j = S.useState("instantType"), _ = S.useState("lastOpenChangeReason"), X = y.useRef(null);
  xe(() => {
    C && a && S.setOpen(!1, Ge(wR));
  }, [C, a, S]), xe(() => {
    L === "ending" && _ === Ro || L !== "ending" && D ? (j !== "delay" && (X.current = j), S.set("instantType", "delay")) : X.current !== null && (S.set("instantType", X.current), X.current = null);
  }, [L, D, _, j, S]), xe(() => {
    R && A == null && S.set("payload", void 0);
  }, [S, A, R]);
  const q = y.useCallback(() => {
    S.setOpen(!1, Ge(np));
  }, [S]);
  y.useImperativeHandle(g, () => ({
    unmount: M,
    close: q
  }), [M, q]);
  const re = R || O || !a && p !== "none";
  return /* @__PURE__ */ k.jsxs(Ox.Provider, {
    value: S,
    children: [re && /* @__PURE__ */ k.jsx(d2, {
      store: S,
      disabled: a,
      trackCursorAxis: p
    }), typeof T == "function" ? T({
      payload: z
    }) : T]
  });
});
function d2({
  store: n,
  disabled: r,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), c = Cu(i, {
    enabled: !r,
    referencePress: () => n.select("closeOnClick")
  }), f = iT(i, {
    enabled: !r && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = y.useMemo(() => Tn(f.reference, c.reference), [f.reference, c.reference]), g = y.useMemo(() => Tn(f.trigger, c.trigger), [f.trigger, c.trigger]), m = y.useMemo(() => Tn(Du, f.floating, c.floating), [f.floating, c.floating]);
  return bp(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const Mx = /* @__PURE__ */ y.createContext(void 0);
function p2() {
  return y.useContext(Mx);
}
let g2 = (function(n) {
  return n[n.popupOpen = fu.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const m2 = 600, Ax = "data-base-ui-tooltip-trigger";
function Xb(n) {
  if ("composedPath" in n) {
    const a = n.composedPath();
    for (let i = 0; i < a.length; i += 1) {
      const c = a[i];
      if (Je(c))
        return c;
    }
  }
  const r = n.target;
  return Je(r) ? r : null;
}
function h2(n) {
  let r = n;
  for (; r; ) {
    if (r.hasAttribute(Ax))
      return r;
    const a = r.parentElement;
    if (a) {
      r = a;
      continue;
    }
    const i = r.getRootNode();
    r = "host" in i && Je(i.host) ? i.host : null;
  }
  return null;
}
const y2 = f0(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    handle: p,
    payload: g,
    disabled: m,
    delay: d,
    closeOnClick: b = !0,
    closeDelay: v,
    id: x,
    ...T
  } = r, S = vi(!0), C = p?.store ?? S;
  if (!C)
    throw new Error(Lt(82));
  const R = dl(x), A = C.useState("isTriggerActive", R), O = C.useState("isOpenedByTrigger", R), z = C.useState("floatingRootContext"), M = y.useRef(null), L = d ?? m2, D = v ?? 0, {
    registerTrigger: j,
    isMountedByThisTrigger: _
  } = v0(R, M, C, {
    payload: g,
    closeOnClick: b,
    closeDelay: D
  }), X = p2(), {
    delayRef: q,
    isInstantPhase: re,
    hasProvider: Q
  } = CR(z, {
    open: O
  }), J = Ep(z);
  C.useSyncedValue("isInstantPhase", re);
  const Z = C.useState("disabled"), G = m ?? Z, N = Vt(G), Y = C.useState("trackCursorAxis"), I = C.useState("disableHoverablePopup"), K = y.useRef(!1), B = rn(), E = y.useRef(void 0);
  function H() {
    const fe = X?.delay, ye = typeof q.current == "object" ? q.current.open : void 0;
    let Te = L;
    return Q && (ye !== 0 ? Te = d ?? fe ?? L : Te = 0), Te;
  }
  function te(fe) {
    const ye = M.current;
    if (!ye || !fe)
      return !1;
    const Te = h2(fe);
    return Te !== null && Te !== ye && Le(ye, Te);
  }
  function ee(fe) {
    const ye = te(fe);
    return K.current = ye, ye && (J.openChangeTimeout.clear(), J.restTimeout.clear(), J.restTimeoutPending = !1, B.clear()), ye;
  }
  const ie = Rp(z, {
    enabled: !G,
    mouseOnly: !0,
    move: !1,
    handleClose: !I && Y !== "both" ? Tp() : null,
    restMs: H,
    delay() {
      const fe = typeof q.current == "object" ? q.current.close : void 0;
      let ye = D;
      return v == null && Q && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: M,
    isActiveTrigger: A,
    isClosing: () => C.select("transitionStatus") === "ending",
    shouldOpen() {
      return !K.current;
    }
  }), ae = E0(z, {
    enabled: !G
  }).reference, le = (fe) => {
    const ye = K.current, Te = Xb(fe), He = ee(Te), ke = M.current, we = ke && Te && Le(ke, Te);
    if (He && C.select("open") && C.select("lastOpenChangeReason") === on) {
      C.setOpen(!1, Ge(on, fe));
      return;
    }
    if (ye && !He && we && !N.current && !C.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    Jo(E.current)) {
      const Ce = () => {
        !K.current && !N.current && !C.select("open") && C.setOpen(!0, Ge(on, fe, ke));
      }, he = H();
      he === 0 ? (B.clear(), Ce()) : B.start(he, Ce);
    }
  }, se = C.useState("triggerProps", _);
  return it("button", r, {
    state: {
      open: O
    },
    ref: [a, j, M],
    props: [ie, ae, _ || Y !== "none" ? se : void 0, {
      onMouseOver(fe) {
        le(fe.nativeEvent);
      },
      onFocus(fe) {
        te(Xb(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        K.current = !1, B.clear(), E.current = void 0;
      },
      onPointerEnter(fe) {
        E.current = fe.pointerType;
      },
      onPointerDown(fe) {
        E.current = fe.pointerType, C.set("closeOnClick", b), b && !C.select("open") && C.cancelPendingOpen(fe.nativeEvent);
      },
      onClick(fe) {
        b && !C.select("open") && C.cancelPendingOpen(fe.nativeEvent);
      },
      id: R,
      [g2.triggerDisabled]: G ? "" : void 0,
      [Ax]: G ? void 0 : ""
    }, T],
    stateAttributesMapping: Op
  });
}), zx = /* @__PURE__ */ y.createContext(void 0);
function b2() {
  const n = y.useContext(zx);
  if (n === void 0)
    throw new Error(Lt(70));
  return n;
}
const v2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    children: i,
    container: c,
    className: f,
    render: p,
    style: g,
    ...m
  } = r, {
    portalNode: d,
    portalSubtree: b
  } = Fv({
    container: c,
    ref: a,
    componentProps: r,
    elementProps: m
  });
  return !b && !d ? null : /* @__PURE__ */ k.jsxs(y.Fragment, {
    children: [b, d && /* @__PURE__ */ ql.createPortal(i, d)]
  });
}), x2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = r;
  return vi().useState("mounted") || i ? /* @__PURE__ */ k.jsx(zx.Provider, {
    value: i,
    children: /* @__PURE__ */ k.jsx(v2, {
      ref: a,
      ...c
    })
  }) : null;
}), Dx = /* @__PURE__ */ y.createContext(void 0);
function Nx() {
  const n = y.useContext(Dx);
  if (n === void 0)
    throw new Error(Lt(71));
  return n;
}
const S2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    anchor: f,
    positionMethod: p = "absolute",
    side: g = "top",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: b = 0,
    collisionBoundary: v = "clipping-ancestors",
    collisionPadding: x = 5,
    arrowPadding: T = 5,
    sticky: S = !1,
    disableAnchorTracking: C = !1,
    collisionAvoidance: R = Kv,
    style: A,
    ...O
  } = r, z = vi(), M = b2(), L = z.useState("open"), D = z.useState("mounted"), j = z.useState("trackCursorAxis"), _ = z.useState("disableHoverablePopup"), X = z.useState("floatingRootContext"), q = z.useState("instantType"), re = z.useState("transitionStatus"), Q = z.useState("hasViewport"), J = Np({
    anchor: f,
    positionMethod: p,
    floatingRootContext: X,
    mounted: D,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: b,
    collisionBoundary: v,
    collisionPadding: x,
    sticky: S,
    arrowPadding: T,
    disableAnchorTracking: C,
    keepMounted: M,
    collisionAvoidance: R,
    adaptiveOrigin: Q ? W0 : void 0
  }), Z = y.useMemo(() => ({
    open: L,
    side: J.side,
    align: J.align,
    anchorHidden: J.anchorHidden,
    instant: j !== "none" ? "tracking-cursor" : q
  }), [L, J.side, J.align, J.anchorHidden, j, q]), G = kp(r, Z, {
    styles: J.positionerStyles,
    transitionStatus: re,
    props: O,
    refs: [a, z.useStateSetter("positionerElement")],
    hidden: !D,
    inert: !L || j === "both" || _
  });
  return /* @__PURE__ */ k.jsx(Dx.Provider, {
    value: J,
    children: G
  });
}), w2 = {
  ...ir,
  ...rr
}, E2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, g = vi(), {
    side: m,
    align: d
  } = Nx(), b = g.useState("open"), v = g.useState("instantType"), x = g.useState("transitionStatus"), T = g.useState("popupProps"), S = g.useState("floatingRootContext"), C = g.useState("disabled"), R = g.useState("closeDelay");
  Mo({
    open: b,
    ref: g.context.popupRef,
    onComplete() {
      b && g.context.onOpenChangeComplete?.(!0);
    }
  }), T0(S, {
    enabled: !C,
    closeDelay: R
  });
  const A = g.useStateSetter("popupElement");
  return it("div", r, {
    state: {
      open: b,
      side: m,
      align: d,
      instant: v,
      transitionStatus: x
    },
    ref: [a, g.context.popupRef, A],
    props: [T, Lu(x), p],
    stateAttributesMapping: w2
  });
}), R2 = /* @__PURE__ */ y.forwardRef(function(r, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = r, g = vi(), {
    arrowRef: m,
    side: d,
    align: b,
    arrowUncentered: v,
    arrowStyles: x
  } = Nx(), T = g.useState("open"), S = g.useState("instantType");
  return it("div", r, {
    state: {
      open: T,
      side: d,
      align: b,
      uncentered: v,
      instant: S
    },
    ref: [a, m],
    props: [{
      style: x,
      "aria-hidden": !0
    }, p],
    stateAttributesMapping: ir
  });
}), T2 = function(r) {
  const {
    delay: a,
    closeDelay: i,
    timeout: c = 400
  } = r, f = y.useMemo(() => ({
    delay: a,
    closeDelay: i
  }), [a, i]), p = y.useMemo(() => ({
    open: a,
    close: i
  }), [a, i]);
  return /* @__PURE__ */ k.jsx(Mx.Provider, {
    value: f,
    children: /* @__PURE__ */ k.jsx(TR, {
      delay: p,
      timeoutMs: c,
      children: r.children
    })
  });
};
function C2({
  delay: n = 0,
  ...r
}) {
  return /* @__PURE__ */ k.jsx(
    T2,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...r
    }
  );
}
function O2({ ...n }) {
  return /* @__PURE__ */ k.jsx(f2, { "data-slot": "tooltip", ...n });
}
function M2({ ...n }) {
  return /* @__PURE__ */ k.jsx(y2, { "data-slot": "tooltip-trigger", ...n });
}
function A2({
  className: n,
  side: r = "top",
  sideOffset: a = 4,
  align: i = "center",
  alignOffset: c = 0,
  children: f,
  ...p
}) {
  return /* @__PURE__ */ k.jsx(x2, { children: /* @__PURE__ */ k.jsx(
    S2,
    {
      align: i,
      alignOffset: c,
      side: r,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ k.jsxs(
        E2,
        {
          "data-slot": "tooltip-content",
          className: st(
            "tw:inline-flex tw:w-fit tw:max-w-xs tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:bg-foreground tw:px-3 tw:py-1.5 tw:text-[var(--fs-label)] tw:text-background tw:has-data-[slot=kbd]:pr-1.5 tw:**:data-[slot=kbd]:relative tw:**:data-[slot=kbd]:isolate tw:**:data-[slot=kbd]:rounded-sm",
            n
          ),
          ...p,
          children: [
            f,
            /* @__PURE__ */ k.jsx(R2, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:rounded-[2px] tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
const _x = 420;
function z2(n) {
  const [r, a] = n.split("-");
  return { side: r, align: a ?? "center" };
}
function D2({ children: n }) {
  return /* @__PURE__ */ k.jsx(C2, { delay: _x, closeDelay: 0, children: n });
}
function N2(n) {
  const { label: r, children: a, placement: i = "top" } = n, c = xd.useId(), [f, p] = xd.useState(!1);
  return /* @__PURE__ */ k.jsxs(O2, { open: f, onOpenChange: p, children: [
    /* @__PURE__ */ k.jsx(
      M2,
      {
        delay: _x,
        closeDelay: 0,
        "aria-describedby": f ? c : void 0,
        onBlur: () => p(!1),
        onMouseLeave: () => p(!1),
        render: a
      }
    ),
    /* @__PURE__ */ k.jsx(A2, { id: c, role: "tooltip", ...z2(i), className: "ui-tooltip open", children: r })
  ] });
}
const Et = (n) => document.getElementById(n);
function bo(n) {
  Et(n)?.click();
}
function Kb(n) {
  const r = Et(n);
  return r ? [...r.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function Qb(n, r) {
  const a = Et(n);
  a && (a.value = r, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function Wa(n, r) {
  return [...document.querySelectorAll(`#${n} ${r}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
function $a({ label: n, items: r }) {
  return r.length ? /* @__PURE__ */ k.jsxs(ux, { children: [
    /* @__PURE__ */ k.jsx(cx, { "data-gallery-filter-group": n.toLowerCase(), children: n }),
    /* @__PURE__ */ k.jsx(fx, { children: /* @__PURE__ */ k.jsx(Pr, { children: r.map((a) => /* @__PURE__ */ k.jsx(
      jd,
      {
        checked: a.active,
        "data-gallery-filter-item": a.key,
        onClick: () => a.element.click(),
        children: a.label
      },
      `${n}-${a.key}`
    )) }) })
  ] }) : null;
}
function _2() {
  const [, n] = y.useReducer((C) => C + 1, 0), r = Et("q")?.value ?? "", a = Et("sort"), i = Et("folder"), c = Et("favChip"), f = Et("rescan")?.classList.contains("spinning") === !0, p = Et("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", g = Wa("fmtMenu", "[data-cat]"), m = Wa("fmtMenu", "input[data-fmt]"), d = Wa("collMenu", "[data-pick]"), b = Wa("wfMenu", "[data-wfpick]"), v = Wa("recMenu", "[data-rec]"), x = document.querySelectorAll("#activeChips [data-fx]").length, T = c?.classList.contains("on") === !0;
  y.useEffect(() => {
    const C = () => n(), R = new MutationObserver(C);
    [
      Et("activeChips"),
      Et("densitySeg"),
      Et("favChip"),
      Et("rescan"),
      Et("fmtMenu"),
      Et("collMenu"),
      Et("wfMenu"),
      Et("recMenu")
    ].filter((z) => !!z).forEach((z) => R.observe(z, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const O = [Et("q"), Et("sort"), Et("folder")].filter((z) => !!z);
    return O.forEach((z) => {
      z.addEventListener("input", C), z.addEventListener("change", C);
    }), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      R.disconnect(), O.forEach((z) => {
        z.removeEventListener("input", C), z.removeEventListener("change", C);
      }), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []);
  const S = (C) => {
    const R = Et("q");
    R && (R.value = C, R.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  return /* @__PURE__ */ k.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", children: [
    /* @__PURE__ */ k.jsxs($O, { className: "gallery-command-search", "data-gallery-command-group": "search", children: [
      /* @__PURE__ */ k.jsx(
        nM,
        {
          "aria-label": "Search project files",
          "data-gallery-command": "search",
          placeholder: "Search by name or folder…",
          value: r,
          onChange: (C) => S(C.target.value)
        }
      ),
      /* @__PURE__ */ k.jsx(tM, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ k.jsx(ME, {}) })
    ] }),
    /* @__PURE__ */ k.jsxs(Lb, { modal: !1, children: [
      /* @__PURE__ */ k.jsx(
        Bb,
        {
          render: /* @__PURE__ */ k.jsxs(Zo, { variant: x ? "secondary" : "outline", size: "sm", children: [
            /* @__PURE__ */ k.jsx(hE, { "data-icon": "inline-start" }),
            /* @__PURE__ */ k.jsxs("span", { "data-gallery-command": "filters", children: [
              "Filters",
              x ? ` (${x})` : ""
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ k.jsxs(Hd, { className: "tw:w-56", children: [
        /* @__PURE__ */ k.jsxs(Pr, { children: [
          /* @__PURE__ */ k.jsx(GO, { children: "Filter gallery" }),
          /* @__PURE__ */ k.jsxs(jd, { checked: c?.classList.contains("on") === !0, onClick: () => bo("favChip"), children: [
            /* @__PURE__ */ k.jsx(Vy, { "data-icon": "inline-start" }),
            " Favorites"
          ] }),
          /* @__PURE__ */ k.jsxs(ux, { children: [
            /* @__PURE__ */ k.jsx(cx, { "data-gallery-filter-group": "folders", children: "Folders" }),
            /* @__PURE__ */ k.jsx(fx, { children: /* @__PURE__ */ k.jsx(Pr, { children: Kb("folder").map((C) => /* @__PURE__ */ k.jsx(
              jd,
              {
                checked: (i?.value ?? "") === C.value,
                "data-gallery-filter-item": C.value || "all",
                onClick: () => Qb("folder", C.value),
                children: C.label
              },
              C.value || "all"
            )) }) })
          ] }),
          /* @__PURE__ */ k.jsx($a, { label: "Formats", items: g }),
          /* @__PURE__ */ k.jsx($a, { label: "File types", items: m }),
          /* @__PURE__ */ k.jsx($a, { label: "Collections", items: d }),
          /* @__PURE__ */ k.jsx($a, { label: "Status", items: b }),
          /* @__PURE__ */ k.jsx($a, { label: "Recent", items: v })
        ] }),
        /* @__PURE__ */ k.jsx(Ib, {}),
        /* @__PURE__ */ k.jsx(Pr, { children: /* @__PURE__ */ k.jsxs(Ps, { onClick: () => bo("filtersClear"), children: [
          /* @__PURE__ */ k.jsx(CE, { "data-icon": "inline-start" }),
          " Clear all filters"
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ k.jsxs(
      Zo,
      {
        variant: T ? "secondary" : "outline",
        size: "sm",
        "data-gallery-command": "favorites",
        "aria-pressed": T,
        onClick: () => bo("favChip"),
        children: [
          /* @__PURE__ */ k.jsx(Vy, { "data-icon": "inline-start" }),
          "Favorites"
        ]
      }
    ),
    /* @__PURE__ */ k.jsxs(HM, { modal: !1, value: a?.value ?? "mtime", onValueChange: (C) => C && Qb("sort", C), children: [
      /* @__PURE__ */ k.jsx(LM, { size: "sm", className: "gallery-command-select gallery-command-sort", "aria-label": "Sort project files", children: /* @__PURE__ */ k.jsx(UM, {}) }),
      /* @__PURE__ */ k.jsx(BM, { children: /* @__PURE__ */ k.jsx(jM, { children: Kb("sort").map((C) => /* @__PURE__ */ k.jsx(IM, { value: C.value, children: C.label }, C.value)) }) })
    ] }),
    /* @__PURE__ */ k.jsxs(
      i2,
      {
        value: [p],
        onValueChange: (C) => {
          const R = C.at(-1);
          R && Et("densitySeg")?.querySelector(`[data-d="${R}"]`)?.click();
        },
        className: "gallery-command-density",
        "aria-label": "Card density",
        children: [
          /* @__PURE__ */ k.jsx(vd, { value: "s", size: "sm", "aria-label": "Compact cards", children: "S" }),
          /* @__PURE__ */ k.jsx(vd, { value: "m", size: "sm", "aria-label": "Medium cards", children: "M" }),
          /* @__PURE__ */ k.jsx(vd, { value: "l", size: "sm", "aria-label": "Large cards", children: "L" })
        ]
      }
    ),
    /* @__PURE__ */ k.jsxs(
      Zo,
      {
        variant: "outline",
        size: "sm",
        "data-gallery-command": "rescan",
        "aria-busy": f,
        disabled: f,
        onClick: () => bo("rescan"),
        children: [
          f ? /* @__PURE__ */ k.jsx(s2, { "data-icon": "inline-start" }) : /* @__PURE__ */ k.jsx(RE, { "data-icon": "inline-start" }),
          /* @__PURE__ */ k.jsx("span", { className: "gallery-command-rescan-label", children: "Rescan" })
        ]
      }
    ),
    /* @__PURE__ */ k.jsxs(Lb, { modal: !1, children: [
      /* @__PURE__ */ k.jsx(N2, { label: "Gallery tools", children: /* @__PURE__ */ k.jsx(Bb, { render: /* @__PURE__ */ k.jsx(Zo, { variant: "ghost", size: "icon-sm", "aria-label": "Gallery tools", children: /* @__PURE__ */ k.jsx(gE, {}) }) }) }),
      /* @__PURE__ */ k.jsxs(Hd, { align: "end", className: "tw:w-48", children: [
        /* @__PURE__ */ k.jsx(Pr, { children: /* @__PURE__ */ k.jsxs(Ps, { onClick: () => bo("viewChip"), children: [
          /* @__PURE__ */ k.jsx(zE, { "data-icon": "inline-start" }),
          " Gallery settings…"
        ] }) }),
        /* @__PURE__ */ k.jsx(Ib, {}),
        /* @__PURE__ */ k.jsxs(Pr, { children: [
          /* @__PURE__ */ k.jsxs(Ps, { onClick: () => bo("boardChip"), children: [
            /* @__PURE__ */ k.jsx(bE, { "data-icon": "inline-start" }),
            " Board"
          ] }),
          /* @__PURE__ */ k.jsxs(Ps, { onClick: () => bo("notesChip"), children: [
            /* @__PURE__ */ k.jsx(wE, { "data-icon": "inline-start" }),
            " Notes"
          ] })
        ] })
      ] })
    ] })
  ] });
}
function k2() {
  const [n, r] = y.useState(null), a = y.useRef(null), i = y.useCallback((c) => {
    const f = a.current;
    f && (a.current = null, r(null), f.resolve(c));
  }, []);
  return y.useEffect(() => (window.__galleryConfirm = (c, f = "Delete") => new Promise((p) => {
    a.current && a.current.resolve(!1);
    const g = { message: c, acceptLabel: f, resolve: p };
    a.current = g, r(g);
  }), () => {
    delete window.__galleryConfirm, a.current && a.current.resolve(!1), a.current = null;
  }), []), /* @__PURE__ */ k.jsx(ZC, { open: !!n, onOpenChange: (c) => {
    c || i(!1);
  }, children: /* @__PURE__ */ k.jsxs(WC, { children: [
    /* @__PURE__ */ k.jsxs($C, { children: [
      /* @__PURE__ */ k.jsx(tO, { children: "Confirm action" }),
      /* @__PURE__ */ k.jsx(nO, { children: n?.message })
    ] }),
    /* @__PURE__ */ k.jsxs(eO, { children: [
      /* @__PURE__ */ k.jsx(oO, { onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ k.jsx(
        lO,
        {
          variant: "destructive",
          "data-gallery-confirm": "accept",
          onClick: () => i(!0),
          children: n?.acceptLabel || "Delete"
        }
      )
    ] })
  ] }) });
}
function H2() {
  const [n, r] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [c, f] = y.useState(Et("inspTitle")?.textContent || "Inspector"), p = y.useRef(Et("inspector")), g = y.useCallback((m) => {
    const d = Et("inspBody");
    d && m && m.appendChild(d);
  }, []);
  return y.useLayoutEffect(() => () => {
    const m = Et("inspBody");
    m && p.current && p.current.appendChild(m);
  }, []), y.useEffect(() => {
    const m = () => {
      const v = document.documentElement.classList.contains("emb");
      r(!v && document.body.classList.contains("has-insp")), f(Et("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(m);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const b = Et("inspTitle");
    return b && d.observe(b, { childList: !0, characterData: !0, subtree: !0 }), m(), () => d.disconnect();
  }, []), y.useEffect(() => {
    const m = window.matchMedia("(max-width: 800px)"), d = () => i(m.matches);
    return m.addEventListener("change", d), d(), () => m.removeEventListener("change", d);
  }, []), /* @__PURE__ */ k.jsx(
    YM,
    {
      modal: a,
      open: n,
      onOpenChange: (m, d) => {
        if (!m && d.reason === "escape-key") {
          d.cancel(), d.allowPropagation();
          return;
        }
        !m && document.body.classList.contains("has-insp") && bo("inspClose");
      },
      children: /* @__PURE__ */ k.jsxs(
        PM,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          keepMounted: !0,
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ k.jsxs(XM, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ k.jsx(KM, { children: c }),
              /* @__PURE__ */ k.jsx(QM, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ k.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const Zb = document.getElementById("gallery-react-toolbar");
Zb && tE.createRoot(Zb).render(
  /* @__PURE__ */ k.jsxs(D2, { children: [
    /* @__PURE__ */ k.jsx(_2, {}),
    /* @__PURE__ */ k.jsx(k2, {}),
    /* @__PURE__ */ k.jsx(H2, {})
  ] })
);
