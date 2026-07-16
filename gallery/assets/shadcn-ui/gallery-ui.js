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
var Md = { exports: {} }, Wa = {};
var cv;
function k1() {
  if (cv) return Wa;
  cv = 1;
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
var uv;
function _1() {
  return uv || (uv = 1, Md.exports = k1()), Md.exports;
}
var b = _1(), Ad = { exports: {} }, Ge = {};
var fv;
function H1() {
  if (fv) return Ge;
  fv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), u = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), x = /* @__PURE__ */ Symbol.for("react.activity"), S = Symbol.iterator;
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
  }, A = Object.assign, E = {};
  function N(O, U, te) {
    this.props = O, this.context = U, this.refs = E, this.updater = te || w;
  }
  N.prototype.isReactComponent = {}, N.prototype.setState = function(O, U) {
    if (typeof O != "object" && typeof O != "function" && O != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, O, U, "setState");
  }, N.prototype.forceUpdate = function(O) {
    this.updater.enqueueForceUpdate(this, O, "forceUpdate");
  };
  function M() {
  }
  M.prototype = N.prototype;
  function D(O, U, te) {
    this.props = O, this.context = U, this.refs = E, this.updater = te || w;
  }
  var z = D.prototype = new M();
  z.constructor = D, A(z, N.prototype), z.isPureReactComponent = !0;
  var I = Array.isArray;
  function j() {
  }
  var H = { H: null, A: null, T: null, S: null }, _ = Object.prototype.hasOwnProperty;
  function k(O, U, te) {
    var J = te.ref;
    return {
      $$typeof: n,
      type: O,
      key: U,
      ref: J !== void 0 ? J : null,
      props: te
    };
  }
  function Y(O, U) {
    return k(O.type, U, O.props);
  }
  function ne(O) {
    return typeof O == "object" && O !== null && O.$$typeof === n;
  }
  function X(O) {
    var U = { "=": "=0", ":": "=2" };
    return "$" + O.replace(/[=:]/g, function(te) {
      return U[te];
    });
  }
  var Z = /\/+/g;
  function Q(O, U) {
    return typeof O == "object" && O !== null && O.key != null ? X("" + O.key) : U.toString(36);
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
  function R(O, U, te, J, re) {
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
              return oe = O._init, R(
                oe(O._payload),
                U,
                te,
                J,
                re
              );
          }
      }
    if (oe)
      return re = re(O), oe = J === "" ? "." + Q(O, 0) : J, I(re) ? (te = "", oe != null && (te = oe.replace(Z, "$&/") + "/"), R(re, U, te, "", function(je) {
        return je;
      })) : re != null && (ne(re) && (re = Y(
        re,
        te + (re.key == null || O && O.key === re.key ? "" : ("" + re.key).replace(
          Z,
          "$&/"
        ) + "/") + oe
      )), U.push(re)), 1;
    oe = 0;
    var se = J === "" ? "." : J + ":";
    if (I(O))
      for (var ge = 0; ge < O.length; ge++)
        J = O[ge], ie = se + Q(J, ge), oe += R(
          J,
          U,
          te,
          ie,
          re
        );
    else if (ge = C(O), typeof ge == "function")
      for (O = ge.call(O), ge = 0; !(J = O.next()).done; )
        J = J.value, ie = se + Q(J, ge++), oe += R(
          J,
          U,
          te,
          ie,
          re
        );
    else if (ie === "object") {
      if (typeof O.then == "function")
        return R(
          q(O),
          U,
          te,
          J,
          re
        );
      throw U = String(O), Error(
        "Objects are not valid as a React child (found: " + (U === "[object Object]" ? "object with keys {" + Object.keys(O).join(", ") + "}" : U) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return oe;
  }
  function B(O, U, te) {
    if (O == null) return O;
    var J = [], re = 0;
    return R(O, J, "", "", function(ie) {
      return U.call(te, ie, re++);
    }), J;
  }
  function P(O) {
    if (O._status === -1) {
      var U = O._result;
      U = U(), U.then(
        function(te) {
          (O._status === 0 || O._status === -1) && (O._status = 1, O._result = te);
        },
        function(te) {
          (O._status === 0 || O._status === -1) && (O._status = 2, O._result = te);
        }
      ), O._status === -1 && (O._status = 0, O._result = U);
    }
    if (O._status === 1) return O._result.default;
    throw O._result;
  }
  var F = typeof reportError == "function" ? reportError : function(O) {
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
  }, L = {
    map: B,
    forEach: function(O, U, te) {
      B(
        O,
        function() {
          U.apply(this, arguments);
        },
        te
      );
    },
    count: function(O) {
      var U = 0;
      return B(O, function() {
        U++;
      }), U;
    },
    toArray: function(O) {
      return B(O, function(U) {
        return U;
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
  return Ge.Activity = x, Ge.Children = L, Ge.Component = N, Ge.Fragment = a, Ge.Profiler = u, Ge.PureComponent = D, Ge.StrictMode = i, Ge.Suspense = m, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = H, Ge.__COMPILER_RUNTIME = {
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
  }, Ge.cloneElement = function(O, U, te) {
    if (O == null)
      throw Error(
        "The argument must be a React element, but you passed " + O + "."
      );
    var J = A({}, O.props), re = O.key;
    if (U != null)
      for (ie in U.key !== void 0 && (re = "" + U.key), U)
        !_.call(U, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && U.ref === void 0 || (J[ie] = U[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) J.children = te;
    else if (1 < ie) {
      for (var oe = Array(ie), se = 0; se < ie; se++)
        oe[se] = arguments[se + 2];
      J.children = oe;
    }
    return k(O.type, re, J);
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
  }, Ge.createElement = function(O, U, te) {
    var J, re = {}, ie = null;
    if (U != null)
      for (J in U.key !== void 0 && (ie = "" + U.key), U)
        _.call(U, J) && J !== "key" && J !== "__self" && J !== "__source" && (re[J] = U[J]);
    var oe = arguments.length - 2;
    if (oe === 1) re.children = te;
    else if (1 < oe) {
      for (var se = Array(oe), ge = 0; ge < oe; ge++)
        se[ge] = arguments[ge + 2];
      re.children = se;
    }
    if (O && O.defaultProps)
      for (J in oe = O.defaultProps, oe)
        re[J] === void 0 && (re[J] = oe[J]);
    return k(O, ie, re);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(O) {
    return { $$typeof: g, render: O };
  }, Ge.isValidElement = ne, Ge.lazy = function(O) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: O },
      _init: P
    };
  }, Ge.memo = function(O, U) {
    return {
      $$typeof: d,
      type: O,
      compare: U === void 0 ? null : U
    };
  }, Ge.startTransition = function(O) {
    var U = H.T, te = {};
    H.T = te;
    try {
      var J = O(), re = H.S;
      re !== null && re(te, J), typeof J == "object" && J !== null && typeof J.then == "function" && J.then(j, F);
    } catch (ie) {
      F(ie);
    } finally {
      U !== null && te.types !== null && (U.types = te.types), H.T = U;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return H.H.useCacheRefresh();
  }, Ge.use = function(O) {
    return H.H.use(O);
  }, Ge.useActionState = function(O, U, te) {
    return H.H.useActionState(O, U, te);
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
  }, Ge.useImperativeHandle = function(O, U, te) {
    return H.H.useImperativeHandle(O, U, te);
  }, Ge.useInsertionEffect = function(O, U) {
    return H.H.useInsertionEffect(O, U);
  }, Ge.useLayoutEffect = function(O, U) {
    return H.H.useLayoutEffect(O, U);
  }, Ge.useMemo = function(O, U) {
    return H.H.useMemo(O, U);
  }, Ge.useOptimistic = function(O, U) {
    return H.H.useOptimistic(O, U);
  }, Ge.useReducer = function(O, U, te) {
    return H.H.useReducer(O, U, te);
  }, Ge.useRef = function(O) {
    return H.H.useRef(O);
  }, Ge.useState = function(O) {
    return H.H.useState(O);
  }, Ge.useSyncExternalStore = function(O, U, te) {
    return H.H.useSyncExternalStore(
      O,
      U,
      te
    );
  }, Ge.useTransition = function() {
    return H.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var dv;
function Ei() {
  return dv || (dv = 1, Ad.exports = H1()), Ad.exports;
}
var y = Ei();
const np = /* @__PURE__ */ j1(y), U1 = /* @__PURE__ */ D1({
  __proto__: null,
  default: np
}, [y]);
var zd = { exports: {} }, ei = {}, Nd = { exports: {} }, Dd = {};
var pv;
function L1() {
  return pv || (pv = 1, (function(n) {
    function o(R, B) {
      var P = R.length;
      R.push(B);
      e: for (; 0 < P; ) {
        var F = P - 1 >>> 1, L = R[F];
        if (0 < u(L, B))
          R[F] = B, R[P] = L, P = F;
        else break e;
      }
    }
    function a(R) {
      return R.length === 0 ? null : R[0];
    }
    function i(R) {
      if (R.length === 0) return null;
      var B = R[0], P = R.pop();
      if (P !== B) {
        R[0] = P;
        e: for (var F = 0, L = R.length, O = L >>> 1; F < O; ) {
          var U = 2 * (F + 1) - 1, te = R[U], J = U + 1, re = R[J];
          if (0 > u(te, P))
            J < L && 0 > u(re, te) ? (R[F] = re, R[J] = P, F = J) : (R[F] = te, R[U] = P, F = U);
          else if (J < L && 0 > u(re, P))
            R[F] = re, R[J] = P, F = J;
          else break e;
        }
      }
      return B;
    }
    function u(R, B) {
      var P = R.sortIndex - B.sortIndex;
      return P !== 0 ? P : R.id - B.id;
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
    var m = [], d = [], v = 1, x = null, S = 3, C = !1, w = !1, A = !1, E = !1, N = typeof setTimeout == "function" ? setTimeout : null, M = typeof clearTimeout == "function" ? clearTimeout : null, D = typeof setImmediate < "u" ? setImmediate : null;
    function z(R) {
      for (var B = a(d); B !== null; ) {
        if (B.callback === null) i(d);
        else if (B.startTime <= R)
          i(d), B.sortIndex = B.expirationTime, o(m, B);
        else break;
        B = a(d);
      }
    }
    function I(R) {
      if (A = !1, z(R), !w)
        if (a(m) !== null)
          w = !0, j || (j = !0, X());
        else {
          var B = a(d);
          B !== null && q(I, B.startTime - R);
        }
    }
    var j = !1, H = -1, _ = 5, k = -1;
    function Y() {
      return E ? !0 : !(n.unstable_now() - k < _);
    }
    function ne() {
      if (E = !1, j) {
        var R = n.unstable_now();
        k = R;
        var B = !0;
        try {
          e: {
            w = !1, A && (A = !1, M(H), H = -1), C = !0;
            var P = S;
            try {
              t: {
                for (z(R), x = a(m); x !== null && !(x.expirationTime > R && Y()); ) {
                  var F = x.callback;
                  if (typeof F == "function") {
                    x.callback = null, S = x.priorityLevel;
                    var L = F(
                      x.expirationTime <= R
                    );
                    if (R = n.unstable_now(), typeof L == "function") {
                      x.callback = L, z(R), B = !0;
                      break t;
                    }
                    x === a(m) && i(m), z(R);
                  } else i(m);
                  x = a(m);
                }
                if (x !== null) B = !0;
                else {
                  var O = a(d);
                  O !== null && q(
                    I,
                    O.startTime - R
                  ), B = !1;
                }
              }
              break e;
            } finally {
              x = null, S = P, C = !1;
            }
            B = void 0;
          }
        } finally {
          B ? X() : j = !1;
        }
      }
    }
    var X;
    if (typeof D == "function")
      X = function() {
        D(ne);
      };
    else if (typeof MessageChannel < "u") {
      var Z = new MessageChannel(), Q = Z.port2;
      Z.port1.onmessage = ne, X = function() {
        Q.postMessage(null);
      };
    } else
      X = function() {
        N(ne, 0);
      };
    function q(R, B) {
      H = N(function() {
        R(n.unstable_now());
      }, B);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(R) {
      R.callback = null;
    }, n.unstable_forceFrameRate = function(R) {
      0 > R || 125 < R ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : _ = 0 < R ? Math.floor(1e3 / R) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return S;
    }, n.unstable_next = function(R) {
      switch (S) {
        case 1:
        case 2:
        case 3:
          var B = 3;
          break;
        default:
          B = S;
      }
      var P = S;
      S = B;
      try {
        return R();
      } finally {
        S = P;
      }
    }, n.unstable_requestPaint = function() {
      E = !0;
    }, n.unstable_runWithPriority = function(R, B) {
      switch (R) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          R = 3;
      }
      var P = S;
      S = R;
      try {
        return B();
      } finally {
        S = P;
      }
    }, n.unstable_scheduleCallback = function(R, B, P) {
      var F = n.unstable_now();
      switch (typeof P == "object" && P !== null ? (P = P.delay, P = typeof P == "number" && 0 < P ? F + P : F) : P = F, R) {
        case 1:
          var L = -1;
          break;
        case 2:
          L = 250;
          break;
        case 5:
          L = 1073741823;
          break;
        case 4:
          L = 1e4;
          break;
        default:
          L = 5e3;
      }
      return L = P + L, R = {
        id: v++,
        callback: B,
        priorityLevel: R,
        startTime: P,
        expirationTime: L,
        sortIndex: -1
      }, P > F ? (R.sortIndex = P, o(d, R), a(m) === null && R === a(d) && (A ? (M(H), H = -1) : A = !0, q(I, P - F))) : (R.sortIndex = L, o(m, R), w || C || (w = !0, j || (j = !0, X()))), R;
    }, n.unstable_shouldYield = Y, n.unstable_wrapCallback = function(R) {
      var B = S;
      return function() {
        var P = S;
        S = B;
        try {
          return R.apply(this, arguments);
        } finally {
          S = P;
        }
      };
    };
  })(Dd)), Dd;
}
var gv;
function I1() {
  return gv || (gv = 1, Nd.exports = L1()), Nd.exports;
}
var jd = { exports: {} }, hn = {};
var mv;
function B1() {
  if (mv) return hn;
  mv = 1;
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
var hv;
function zb() {
  if (hv) return jd.exports;
  hv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), jd.exports = B1(), jd.exports;
}
var yv;
function V1() {
  if (yv) return ei;
  yv = 1;
  var n = I1(), o = Ei(), a = zb();
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
  var x = Object.assign, S = /* @__PURE__ */ Symbol.for("react.element"), C = /* @__PURE__ */ Symbol.for("react.transitional.element"), w = /* @__PURE__ */ Symbol.for("react.portal"), A = /* @__PURE__ */ Symbol.for("react.fragment"), E = /* @__PURE__ */ Symbol.for("react.strict_mode"), N = /* @__PURE__ */ Symbol.for("react.profiler"), M = /* @__PURE__ */ Symbol.for("react.consumer"), D = /* @__PURE__ */ Symbol.for("react.context"), z = /* @__PURE__ */ Symbol.for("react.forward_ref"), I = /* @__PURE__ */ Symbol.for("react.suspense"), j = /* @__PURE__ */ Symbol.for("react.suspense_list"), H = /* @__PURE__ */ Symbol.for("react.memo"), _ = /* @__PURE__ */ Symbol.for("react.lazy"), k = /* @__PURE__ */ Symbol.for("react.activity"), Y = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), ne = Symbol.iterator;
  function X(e) {
    return e === null || typeof e != "object" ? null : (e = ne && e[ne] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var Z = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Q(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === Z ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case A:
        return "Fragment";
      case N:
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
        case D:
          return e.displayName || "Context";
        case M:
          return (e._context.displayName || "Context") + ".Consumer";
        case z:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case H:
          return t = e.displayName || null, t !== null ? t : Q(e.type) || "Memo";
        case _:
          t = e._payload, e = e._init;
          try {
            return Q(e(t));
          } catch {
          }
      }
    return null;
  }
  var q = Array.isArray, R = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, B = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, P = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, F = [], L = -1;
  function O(e) {
    return { current: e };
  }
  function U(e) {
    0 > L || (e.current = F[L], F[L] = null, L--);
  }
  function te(e, t) {
    L++, F[L] = e.current, e.current = t;
  }
  var J = O(null), re = O(null), ie = O(null), oe = O(null);
  function se(e, t) {
    switch (te(ie, t), te(re, e), te(J, null), t.nodeType) {
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
    U(J), te(J, e);
  }
  function ge() {
    U(J), U(re), U(ie);
  }
  function je(e) {
    e.memoizedState !== null && te(oe, e);
    var t = J.current, l = jy(t, e.type);
    t !== l && (te(re, e), te(J, l));
  }
  function Ee(e) {
    re.current === e && (U(J), U(re)), oe.current === e && (U(oe), Qa._currentValue = P);
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
      var c = r.DetermineComponentFrameRoot(), h = c[0], T = c[1];
      if (h && T) {
        var V = h.split(`
`), W = T.split(`
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
    var T = e.entanglements, V = e.expirationTimes, W = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ce = 31 - yt(l), de = 1 << ce;
      T[ce] = 0, V[ce] = -1;
      var ee = W[ce];
      if (ee !== null)
        for (W[ce] = null, ce = 0; ce < ee.length; ce++) {
          var le = ee[ce];
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
    var e = B.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : nv(e.type));
  }
  function ln(e, t) {
    var l = B.p;
    try {
      return B.p = e, t();
    } finally {
      B.p = l;
    }
  }
  var en = Math.random().toString(36).slice(2), Ot = "__reactFiber$" + en, cn = "__reactProps$" + en, rl = "__reactContainer$" + en, ca = "__reactEvents$" + en, Di = "__reactListeners$" + en, wS = "__reactHandles$" + en, bg = "__reactResources$" + en, ua = "__reactMarker$" + en;
  function bu(e) {
    delete e[Ot], delete e[cn], delete e[ca], delete e[Di], delete e[wS];
  }
  function dr(e) {
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
    var t = e[bg];
    return t || (t = e[bg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function on(e) {
    e[ua] = !0;
  }
  var xg = /* @__PURE__ */ new Set(), Sg = {};
  function Ho(e, t) {
    mr(e, t), mr(e + "Capture", t);
  }
  function mr(e, t) {
    for (Sg[e] = t, e = 0; e < t.length; e++)
      xg.add(t[e]);
  }
  var ES = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), wg = {}, Eg = {};
  function TS(e) {
    return he.call(Eg, e) ? !0 : he.call(wg, e) ? !1 : ES.test(e) ? Eg[e] = !0 : (wg[e] = !0, !1);
  }
  function ji(e, t, l) {
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
  function xu(e) {
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
  function _i(e) {
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
  function Su(e, t, l, r, s, c, h, T) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Yn(t)) : e.value !== "" + Yn(t) && (e.value = "" + Yn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? wu(e, h, Yn(t)) : l != null ? wu(e, h, Yn(l)) : r != null && e.removeAttribute("value"), s == null && c != null && (e.defaultChecked = !!c), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), T != null && typeof T != "function" && typeof T != "symbol" && typeof T != "boolean" ? e.name = "" + Yn(T) : e.removeAttribute("name");
  }
  function Cg(e, t, l, r, s, c, h, T) {
    if (c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (e.type = c), t != null || l != null) {
      if (!(c !== "submit" && c !== "reset" || t != null)) {
        xu(e);
        return;
      }
      l = l != null ? "" + Yn(l) : "", t = t != null ? "" + Yn(t) : l, T || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = T ? e.checked : !!r, e.defaultChecked = !!r, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), xu(e);
  }
  function wu(e, t, l) {
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
    l = Yn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), xu(e);
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
  function Eu(e) {
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
  function Hi(e) {
    return AS.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function bl() {
  }
  var Tu = null;
  function Ru(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var vr = null, br = null;
  function Ng(e) {
    var t = pr(e);
    if (t && (e = t.stateNode)) {
      var l = e[cn] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Su(
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
                Su(
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
          t = l.value, t != null && hr(e, !!l.multiple, t, !1);
      }
    }
  }
  var Cu = !1;
  function Dg(e, t, l) {
    if (Cu) return e(t, l);
    Cu = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (Cu = !1, (vr !== null || br !== null) && (Es(), vr && (t = vr, e = br, br = vr = null, Ng(t), e)))
        for (t = 0; t < e.length; t++) Ng(e[t]);
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
  var xl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Ou = !1;
  if (xl)
    try {
      var pa = {};
      Object.defineProperty(pa, "passive", {
        get: function() {
          Ou = !0;
        }
      }), window.addEventListener("test", pa, pa), window.removeEventListener("test", pa, pa);
    } catch {
      Ou = !1;
    }
  var Jl = null, Mu = null, Ui = null;
  function jg() {
    if (Ui) return Ui;
    var e, t = Mu, l = t.length, r, s = "value" in Jl ? Jl.value : Jl.textContent, c = s.length;
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
  function kg() {
    return !1;
  }
  function wn(e) {
    function t(l, r, s, c, h) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = c, this.target = h, this.currentTarget = null;
      for (var T in e)
        e.hasOwnProperty(T) && (l = e[T], this[T] = l ? l(c) : c[T]);
      return this.isDefaultPrevented = (c.defaultPrevented != null ? c.defaultPrevented : c.returnValue === !1) ? Ii : kg, this.isPropagationStopped = kg, this;
    }
    return x(t.prototype, {
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
  }, Bi = wn(Uo), ga = x({}, Uo, { view: 0, detail: 0 }), zS = wn(ga), Au, zu, ma, Vi = x({}, ga, {
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
    getModifierState: Du,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ma && (ma && e.type === "mousemove" ? (Au = e.screenX - ma.screenX, zu = e.screenY - ma.screenY) : zu = Au = 0, ma = e), Au);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : zu;
    }
  }), _g = wn(Vi), NS = x({}, Vi, { dataTransfer: 0 }), DS = wn(NS), jS = x({}, ga, { relatedTarget: 0 }), Nu = wn(jS), kS = x({}, Uo, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), _S = wn(kS), HS = x({}, Uo, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), US = wn(HS), LS = x({}, Uo, { data: 0 }), Hg = wn(LS), IS = {
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
  function Du() {
    return PS;
  }
  var YS = x({}, ga, {
    key: function(e) {
      if (e.key) {
        var t = IS[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = Li(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? BS[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: Du,
    charCode: function(e) {
      return e.type === "keypress" ? Li(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? Li(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), GS = wn(YS), qS = x({}, Vi, {
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
  }), Ug = wn(qS), XS = x({}, ga, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: Du
  }), FS = wn(XS), KS = x({}, Uo, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), QS = wn(KS), ZS = x({}, Vi, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), JS = wn(ZS), $S = x({}, Uo, {
    newState: 0,
    oldState: 0
  }), WS = wn($S), ew = [9, 13, 27, 32], ju = xl && "CompositionEvent" in window, ha = null;
  xl && "documentMode" in document && (ha = document.documentMode);
  var tw = xl && "TextEvent" in window && !ha, Lg = xl && (!ju || ha && 8 < ha && 11 >= ha), Ig = " ", Bg = !1;
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
  var xr = !1;
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
    if (xr)
      return e === "compositionend" || !ju && Vg(e, t) ? (e = jg(), Ui = Mu = Jl = null, xr = !1, e) : null;
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
    vr ? br ? br.push(r) : br = [r] : vr = r, t = zs(t, "onChange"), 0 < t.length && (l = new Bi(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var ya = null, va = null;
  function rw(e) {
    Cy(e, 0);
  }
  function Pi(e) {
    var t = fa(e);
    if (Rg(t)) return e;
  }
  function qg(e, t) {
    if (e === "change") return t;
  }
  var Xg = !1;
  if (xl) {
    var ku;
    if (xl) {
      var _u = "oninput" in document;
      if (!_u) {
        var Fg = document.createElement("div");
        Fg.setAttribute("oninput", "return;"), _u = typeof Fg.oninput == "function";
      }
      ku = _u;
    } else ku = !1;
    Xg = ku && (!document.documentMode || 9 < document.documentMode);
  }
  function Kg() {
    ya && (ya.detachEvent("onpropertychange", Qg), va = ya = null);
  }
  function Qg(e) {
    if (e.propertyName === "value" && Pi(va)) {
      var t = [];
      Gg(
        t,
        va,
        e,
        Ru(e)
      ), Dg(rw, t);
    }
  }
  function aw(e, t, l) {
    e === "focusin" ? (Kg(), ya = t, va = l, ya.attachEvent("onpropertychange", Qg)) : e === "focusout" && Kg();
  }
  function iw(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Pi(va);
  }
  function sw(e, t) {
    if (e === "click") return Pi(t);
  }
  function cw(e, t) {
    if (e === "input" || e === "change")
      return Pi(t);
  }
  function uw(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Nn = typeof Object.is == "function" ? Object.is : uw;
  function ba(e, t) {
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
  function Hu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var fw = xl && "documentMode" in document && 11 >= document.documentMode, Sr = null, Uu = null, xa = null, Lu = !1;
  function em(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    Lu || Sr == null || Sr !== _i(r) || (r = Sr, "selectionStart" in r && Hu(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), xa && ba(xa, r) || (xa = r, r = zs(Uu, "onSelect"), 0 < r.length && (t = new Bi(
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
  }, Iu = {}, tm = {};
  xl && (tm = document.createElement("div").style, "AnimationEvent" in window || (delete wr.animationend.animation, delete wr.animationiteration.animation, delete wr.animationstart.animation), "TransitionEvent" in window || delete wr.transitionend.transition);
  function Io(e) {
    if (Iu[e]) return Iu[e];
    if (!wr[e]) return e;
    var t = wr[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in tm)
        return Iu[e] = t[l];
    return e;
  }
  var nm = Io("animationend"), lm = Io("animationiteration"), om = Io("animationstart"), dw = Io("transitionrun"), pw = Io("transitionstart"), gw = Io("transitioncancel"), rm = Io("transitionend"), am = /* @__PURE__ */ new Map(), Bu = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Bu.push("scrollEnd");
  function nl(e, t) {
    am.set(e, t), Ho(t, [e]);
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
  }, qn = [], Er = 0, Vu = 0;
  function Gi() {
    for (var e = Er, t = Vu = Er = 0; t < e; ) {
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
  function qi(e, t, l, r) {
    qn[Er++] = e, qn[Er++] = t, qn[Er++] = l, qn[Er++] = r, Vu |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function Pu(e, t, l, r) {
    return qi(e, t, l, r), Xi(e);
  }
  function Bo(e, t) {
    return qi(e, null, null, t), Xi(e);
  }
  function im(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, c = e.return; c !== null; )
      c.childLanes |= l, r = c.alternate, r !== null && (r.childLanes |= l), c.tag === 22 && (e = c.stateNode, e === null || e._visibility & 1 || (s = !0)), e = c, c = c.return;
    return e.tag === 3 ? (c = e.stateNode, s && t !== null && (s = 31 - yt(l), e = c.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), c) : null;
  }
  function Xi(e) {
    if (50 < Pa)
      throw Pa = 0, $f = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Tr = {};
  function mw(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Dn(e, t, l, r) {
    return new mw(e, t, l, r);
  }
  function Yu(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function Sl(e, t) {
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
  function Fi(e, t, l, r, s, c) {
    var h = 0;
    if (r = e, typeof e == "function") Yu(e) && (h = 1);
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
        case A:
          return Vo(l.children, s, c, t);
        case E:
          h = 8, s |= 24;
          break;
        case N:
          return e = Dn(12, l, t, s | 2), e.elementType = N, e.lanes = c, e;
        case I:
          return e = Dn(13, l, t, s), e.elementType = I, e.lanes = c, e;
        case j:
          return e = Dn(19, l, t, s), e.elementType = j, e.lanes = c, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case D:
                h = 10;
                break e;
              case M:
                h = 9;
                break e;
              case z:
                h = 11;
                break e;
              case H:
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
  function Vo(e, t, l, r) {
    return e = Dn(7, e, r, t), e.lanes = l, e;
  }
  function Gu(e, t, l) {
    return e = Dn(6, e, null, t), e.lanes = l, e;
  }
  function cm(e) {
    var t = Dn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function qu(e, t, l) {
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
  var Rr = [], Cr = 0, Ki = null, Sa = 0, Fn = [], Kn = 0, $l = null, al = 1, il = "";
  function wl(e, t) {
    Rr[Cr++] = Sa, Rr[Cr++] = Ki, Ki = e, Sa = t;
  }
  function fm(e, t, l) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, $l = e;
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
  function Xu(e) {
    e.return !== null && (wl(e, 1), fm(e, 1, 0));
  }
  function Fu(e) {
    for (; e === Ki; )
      Ki = Rr[--Cr], Rr[Cr] = null, Sa = Rr[--Cr], Rr[Cr] = null;
    for (; e === $l; )
      $l = Fn[--Kn], Fn[Kn] = null, il = Fn[--Kn], Fn[Kn] = null, al = Fn[--Kn], Fn[Kn] = null;
  }
  function dm(e, t) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, al = t.id, il = t.overflow, $l = e;
  }
  var un = null, kt = null, st = !1, Wl = null, Qn = !1, Ku = Error(i(519));
  function eo(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw wa(Xn(t, e)), Ku;
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
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || zy(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = bl), t = !0) : t = !1, t || eo(e, !0);
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
  function Or(e) {
    if (e !== un) return !1;
    if (!st) return gm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || pd(e.type, e.memoizedProps)), l = !l), l && kt && eo(e), gm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Iy(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      kt = Iy(e);
    } else
      t === 27 ? (t = kt, mo(e.type) ? (e = vd, vd = null, kt = e) : kt = t) : kt = un ? Jn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Po() {
    kt = un = null, st = !1;
  }
  function Qu() {
    var e = Wl;
    return e !== null && (Cn === null ? Cn = e : Cn.push.apply(
      Cn,
      e
    ), Wl = null), e;
  }
  function wa(e) {
    Wl === null ? Wl = [e] : Wl.push(e);
  }
  var Zu = O(null), Yo = null, El = null;
  function to(e, t, l) {
    te(Zu, t._currentValue), t._currentValue = l;
  }
  function Tl(e) {
    e._currentValue = Zu.current, U(Zu);
  }
  function Ju(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function $u(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var c = s.dependencies;
      if (c !== null) {
        var h = s.child;
        c = c.firstContext;
        e: for (; c !== null; ) {
          var T = c;
          c = s;
          for (var V = 0; V < t.length; V++)
            if (T.context === t[V]) {
              c.lanes |= l, T = c.alternate, T !== null && (T.lanes |= l), Ju(
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
        h.lanes |= l, c = h.alternate, c !== null && (c.lanes |= l), Ju(h, l, e), h = null;
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
          Nn(s.pendingProps.value, h.value) || (e !== null ? e.push(T) : e = [T]);
        }
      } else if (s === oe.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Qa) : e = [Qa]);
      }
      s = s.return;
    }
    e !== null && $u(
      t,
      e,
      l,
      r
    ), t.flags |= 262144;
  }
  function Qi(e) {
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
  function Go(e) {
    Yo = e, El = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function fn(e) {
    return mm(Yo, e);
  }
  function Zi(e, t) {
    return Yo === null && Go(e), mm(e, t);
  }
  function mm(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, El === null) {
      if (e === null) throw Error(i(308));
      El = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else El = El.next = t;
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
    $$typeof: D,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Wu() {
    return {
      controller: new hw(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ea(e) {
    e.refCount--, e.refCount === 0 && yw(vw, function() {
      e.controller.abort();
    });
  }
  var Ta = null, ef = 0, Ar = 0, zr = null;
  function bw(e, t) {
    if (Ta === null) {
      var l = Ta = [];
      ef = 0, Ar = od(), zr = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return ef++, t.then(hm, hm), t;
  }
  function hm() {
    if (--ef === 0 && Ta !== null) {
      zr !== null && (zr.status = "fulfilled");
      var e = Ta;
      Ta = null, Ar = 0, zr = null;
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
  var ym = R.S;
  R.S = function(e, t) {
    ey = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && bw(e, t), ym !== null && ym(e, t);
  };
  var qo = O(null);
  function tf() {
    var e = qo.current;
    return e !== null ? e : Mt.pooledCache;
  }
  function Ji(e, t) {
    t === null ? te(qo, qo.current) : te(qo, t.pool);
  }
  function vm() {
    var e = tf();
    return e === null ? null : { parent: Zt._currentValue, pool: e };
  }
  var Nr = Error(i(460)), nf = Error(i(474)), $i = Error(i(542)), Wi = { then: function() {
  } };
  function bm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function xm(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(bl, bl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, wm(e), e;
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
            throw e = t.reason, wm(e), e;
        }
        throw Fo = t, Nr;
    }
  }
  function Xo(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (l) {
      throw l !== null && typeof l == "object" && typeof l.then == "function" ? (Fo = l, Nr) : l;
    }
  }
  var Fo = null;
  function Sm() {
    if (Fo === null) throw Error(i(459));
    var e = Fo;
    return Fo = null, e;
  }
  function wm(e) {
    if (e === Nr || e === $i)
      throw Error(i(483));
  }
  var Dr = null, Ra = 0;
  function es(e) {
    var t = Ra;
    return Ra += 1, Dr === null && (Dr = []), xm(Dr, e, t);
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
      return K = Sl(K, G), K.index = 0, K.sibling = null, K;
    }
    function c(K, G, $) {
      return K.index = $, e ? ($ = K.alternate, $ !== null ? ($ = $.index, $ < G ? (K.flags |= 67108866, G) : $) : (K.flags |= 67108866, G)) : (K.flags |= 1048576, G);
    }
    function h(K) {
      return e && K.alternate === null && (K.flags |= 67108866), K;
    }
    function T(K, G, $, ue) {
      return G === null || G.tag !== 6 ? (G = Gu($, K.mode, ue), G.return = K, G) : (G = s(G, $), G.return = K, G);
    }
    function V(K, G, $, ue) {
      var Ie = $.type;
      return Ie === A ? ce(
        K,
        G,
        $.props.children,
        ue,
        $.key
      ) : G !== null && (G.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && Xo(Ie) === G.type) ? (G = s(G, $.props), Ca(G, $), G.return = K, G) : (G = Fi(
        $.type,
        $.key,
        $.props,
        null,
        K.mode,
        ue
      ), Ca(G, $), G.return = K, G);
    }
    function W(K, G, $, ue) {
      return G === null || G.tag !== 4 || G.stateNode.containerInfo !== $.containerInfo || G.stateNode.implementation !== $.implementation ? (G = qu($, K.mode, ue), G.return = K, G) : (G = s(G, $.children || []), G.return = K, G);
    }
    function ce(K, G, $, ue, Ie) {
      return G === null || G.tag !== 7 ? (G = Vo(
        $,
        K.mode,
        ue,
        Ie
      ), G.return = K, G) : (G = s(G, $), G.return = K, G);
    }
    function de(K, G, $) {
      if (typeof G == "string" && G !== "" || typeof G == "number" || typeof G == "bigint")
        return G = Gu(
          "" + G,
          K.mode,
          $
        ), G.return = K, G;
      if (typeof G == "object" && G !== null) {
        switch (G.$$typeof) {
          case C:
            return $ = Fi(
              G.type,
              G.key,
              G.props,
              null,
              K.mode,
              $
            ), Ca($, G), $.return = K, $;
          case w:
            return G = qu(
              G,
              K.mode,
              $
            ), G.return = K, G;
          case _:
            return G = Xo(G), de(K, G, $);
        }
        if (q(G) || X(G))
          return G = Vo(
            G,
            K.mode,
            $,
            null
          ), G.return = K, G;
        if (typeof G.then == "function")
          return de(K, es(G), $);
        if (G.$$typeof === D)
          return de(
            K,
            Zi(K, G),
            $
          );
        ts(K, G);
      }
      return null;
    }
    function ee(K, G, $, ue) {
      var Ie = G !== null ? G.key : null;
      if (typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint")
        return Ie !== null ? null : T(K, G, "" + $, ue);
      if (typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case C:
            return $.key === Ie ? V(K, G, $, ue) : null;
          case w:
            return $.key === Ie ? W(K, G, $, ue) : null;
          case _:
            return $ = Xo($), ee(K, G, $, ue);
        }
        if (q($) || X($))
          return Ie !== null ? null : ce(K, G, $, ue, null);
        if (typeof $.then == "function")
          return ee(
            K,
            G,
            es($),
            ue
          );
        if ($.$$typeof === D)
          return ee(
            K,
            G,
            Zi(K, $),
            ue
          );
        ts(K, $);
      }
      return null;
    }
    function le(K, G, $, ue, Ie) {
      if (typeof ue == "string" && ue !== "" || typeof ue == "number" || typeof ue == "bigint")
        return K = K.get($) || null, T(G, K, "" + ue, Ie);
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
            return ue = Xo(ue), le(
              K,
              G,
              $,
              ue,
              Ie
            );
        }
        if (q(ue) || X(ue))
          return K = K.get($) || null, ce(G, K, ue, Ie, null);
        if (typeof ue.then == "function")
          return le(
            K,
            G,
            $,
            es(ue),
            Ie
          );
        if (ue.$$typeof === D)
          return le(
            K,
            G,
            $,
            Zi(G, ue),
            Ie
          );
        ts(G, ue);
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
        return l(K, De), st && wl(K, Fe), Ie;
      if (De === null) {
        for (; Fe < $.length; Fe++)
          De = de(K, $[Fe], ue), De !== null && (G = c(
            De,
            G,
            Fe
          ), ut === null ? Ie = De : ut.sibling = De, ut = De);
        return st && wl(K, Fe), Ie;
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
      return e && De.forEach(function(xo) {
        return t(K, xo);
      }), st && wl(K, Fe), Ie;
    }
    function Ve(K, G, $, ue) {
      if ($ == null) throw Error(i(151));
      for (var Ie = null, ut = null, De = G, Fe = G = 0, it = null, ft = $.next(); De !== null && !ft.done; Fe++, ft = $.next()) {
        De.index > Fe ? (it = De, De = null) : it = De.sibling;
        var xo = ee(K, De, ft.value, ue);
        if (xo === null) {
          De === null && (De = it);
          break;
        }
        e && De && xo.alternate === null && t(K, De), G = c(xo, G, Fe), ut === null ? Ie = xo : ut.sibling = xo, ut = xo, De = it;
      }
      if (ft.done)
        return l(K, De), st && wl(K, Fe), Ie;
      if (De === null) {
        for (; !ft.done; Fe++, ft = $.next())
          ft = de(K, ft.value, ue), ft !== null && (G = c(ft, G, Fe), ut === null ? Ie = ft : ut.sibling = ft, ut = ft);
        return st && wl(K, Fe), Ie;
      }
      for (De = r(De); !ft.done; Fe++, ft = $.next())
        ft = le(De, K, Fe, ft.value, ue), ft !== null && (e && ft.alternate !== null && De.delete(ft.key === null ? Fe : ft.key), G = c(ft, G, Fe), ut === null ? Ie = ft : ut.sibling = ft, ut = ft);
      return e && De.forEach(function(N1) {
        return t(K, N1);
      }), st && wl(K, Fe), Ie;
    }
    function Tt(K, G, $, ue) {
      if (typeof $ == "object" && $ !== null && $.type === A && $.key === null && ($ = $.props.children), typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case C:
            e: {
              for (var Ie = $.key; G !== null; ) {
                if (G.key === Ie) {
                  if (Ie = $.type, Ie === A) {
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
                  } else if (G.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === _ && Xo(Ie) === G.type) {
                    l(
                      K,
                      G.sibling
                    ), ue = s(G, $.props), Ca(ue, $), ue.return = K, K = ue;
                    break e;
                  }
                  l(K, G);
                  break;
                } else t(K, G);
                G = G.sibling;
              }
              $.type === A ? (ue = Vo(
                $.props.children,
                K.mode,
                ue,
                $.key
              ), ue.return = K, K = ue) : (ue = Fi(
                $.type,
                $.key,
                $.props,
                null,
                K.mode,
                ue
              ), Ca(ue, $), ue.return = K, K = ue);
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
              ue = qu($, K.mode, ue), ue.return = K, K = ue;
            }
            return h(K);
          case _:
            return $ = Xo($), Tt(
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
        if (X($)) {
          if (Ie = X($), typeof Ie != "function") throw Error(i(150));
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
            es($),
            ue
          );
        if ($.$$typeof === D)
          return Tt(
            K,
            G,
            Zi(K, $),
            ue
          );
        ts(K, $);
      }
      return typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint" ? ($ = "" + $, G !== null && G.tag === 6 ? (l(K, G.sibling), ue = s(G, $), ue.return = K, K = ue) : (l(K, G), ue = Gu($, K.mode, ue), ue.return = K, K = ue), h(K)) : l(K, G);
    }
    return function(K, G, $, ue) {
      try {
        Ra = 0;
        var Ie = Tt(
          K,
          G,
          $,
          ue
        );
        return Dr = null, Ie;
      } catch (De) {
        if (De === Nr || De === $i) throw De;
        var ut = Dn(29, De, null, K.mode);
        return ut.lanes = ue, ut.return = K, ut;
      }
    };
  }
  var Ko = Em(!0), Tm = Em(!1), no = !1;
  function lf(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function of(e, t) {
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
    if (r = r.shared, (gt & 2) !== 0) {
      var s = r.pending;
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Xi(e), im(e, null, l), t;
    }
    return qi(e, r, t, l), Xi(e);
  }
  function Oa(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  function rf(e, t) {
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
  var af = !1;
  function Ma() {
    if (af) {
      var e = zr;
      if (e !== null) throw e;
    }
  }
  function Aa(e, t, l, r) {
    af = !1;
    var s = e.updateQueue;
    no = !1;
    var c = s.firstBaseUpdate, h = s.lastBaseUpdate, T = s.shared.pending;
    if (T !== null) {
      s.shared.pending = null;
      var V = T, W = V.next;
      V.next = null, h === null ? c = W : h.next = W, h = V;
      var ce = e.alternate;
      ce !== null && (ce = ce.updateQueue, T = ce.lastBaseUpdate, T !== h && (T === null ? ce.firstBaseUpdate = W : T.next = W, ce.lastBaseUpdate = V));
    }
    if (c !== null) {
      var de = s.baseState;
      h = 0, ce = W = V = null, T = c;
      do {
        var ee = T.lane & -536870913, le = ee !== T.lane;
        if (le ? (at & ee) === ee : (r & ee) === ee) {
          ee !== 0 && ee === Ar && (af = !0), ce !== null && (ce = ce.next = {
            lane: 0,
            tag: T.tag,
            payload: T.payload,
            callback: null,
            next: null
          });
          e: {
            var Ne = e, Ve = T;
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
                no = !0;
            }
          }
          ee = T.callback, ee !== null && (e.flags |= 64, le && (e.flags |= 8192), le = s.callbacks, le === null ? s.callbacks = [ee] : le.push(ee));
        } else
          le = {
            lane: ee,
            tag: T.tag,
            payload: T.payload,
            callback: T.callback,
            next: null
          }, ce === null ? (W = ce = le, V = de) : ce = ce.next = le, h |= ee;
        if (T = T.next, T === null) {
          if (T = s.shared.pending, T === null)
            break;
          le = T, T = le.next, le.next = null, s.lastBaseUpdate = le, s.shared.pending = null;
        }
      } while (!0);
      ce === null && (V = de), s.baseState = V, s.firstBaseUpdate = W, s.lastBaseUpdate = ce, c === null && (s.shared.lanes = 0), co |= h, e.lanes = h, e.memoizedState = de;
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
  var jr = O(null), ns = O(0);
  function Om(e, t) {
    e = jl, te(ns, e), te(jr, t), jl = e | t.baseLanes;
  }
  function sf() {
    te(ns, jl), te(jr, jr.current);
  }
  function cf() {
    jl = ns.current, U(jr), U(ns);
  }
  var jn = O(null), Zn = null;
  function ro(e) {
    var t = e.alternate;
    te(Ft, Ft.current & 1), te(jn, e), Zn === null && (t === null || jr.current !== null || t.memoizedState !== null) && (Zn = e);
  }
  function uf(e) {
    te(Ft, Ft.current), te(jn, e), Zn === null && (Zn = e);
  }
  function Mm(e) {
    e.tag === 22 ? (te(Ft, Ft.current), te(jn, e), Zn === null && (Zn = e)) : ao();
  }
  function ao() {
    te(Ft, Ft.current), te(jn, jn.current);
  }
  function kn(e) {
    U(jn), Zn === e && (Zn = null), U(Ft);
  }
  var Ft = O(0);
  function ls(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || hd(l) || yd(l)))
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
  var Rl = 0, Xe = null, wt = null, Jt = null, os = !1, kr = !1, Qo = !1, rs = 0, za = 0, _r = null, Sw = 0;
  function Bt() {
    throw Error(i(321));
  }
  function ff(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Nn(e[l], t[l])) return !1;
    return !0;
  }
  function df(e, t, l, r, s, c) {
    return Rl = c, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, R.H = e === null || e.memoizedState === null ? fh : Of, Qo = !1, c = l(r, s), Qo = !1, kr && (c = zm(
      t,
      l,
      r,
      s
    )), Am(e), c;
  }
  function Am(e) {
    R.H = ja;
    var t = wt !== null && wt.next !== null;
    if (Rl = 0, Jt = wt = Xe = null, os = !1, za = 0, _r = null, t) throw Error(i(300));
    e === null || $t || (e = e.dependencies, e !== null && Qi(e) && ($t = !0));
  }
  function zm(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (kr && (_r = null), za = 0, kr = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Jt = wt = null, e.updateQueue != null) {
        var c = e.updateQueue;
        c.lastEffect = null, c.events = null, c.stores = null, c.memoCache != null && (c.memoCache.index = 0);
      }
      R.H = dh, c = t(l, r);
    } while (kr);
    return c;
  }
  function ww() {
    var e = R.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Na(t) : t, e = e.useState()[0], (wt !== null ? wt.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function pf() {
    var e = rs !== 0;
    return rs = 0, e;
  }
  function gf(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function mf(e) {
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
  function Na(e) {
    var t = za;
    return za += 1, _r === null && (_r = []), e = xm(_r, e, t), t = Xe, (Jt === null ? t.memoizedState : Jt.next) === null && (t = t.alternate, R.H = t === null || t.memoizedState === null ? fh : Of), e;
  }
  function is(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Na(e);
      if (e.$$typeof === D) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function hf(e) {
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
        l[r] = Y;
    return t.index++, l;
  }
  function Cl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function ss(e) {
    var t = Kt();
    return yf(t, wt, e);
  }
  function yf(e, t, l) {
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
      var T = h = null, V = null, W = t, ce = !1;
      do {
        var de = W.lane & -536870913;
        if (de !== W.lane ? (at & de) === de : (Rl & de) === de) {
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
            }), de === Ar && (ce = !0);
          else if ((Rl & ee) === ee) {
            W = W.next, ee === Ar && (ce = !0);
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
            }, V === null ? (T = V = de, h = c) : V = V.next = de, Xe.lanes |= ee, co |= ee;
          de = W.action, Qo && l(c, de), c = W.hasEagerState ? W.eagerState : l(c, de);
        } else
          ee = {
            lane: de,
            revertLane: W.revertLane,
            gesture: W.gesture,
            action: W.action,
            hasEagerState: W.hasEagerState,
            eagerState: W.eagerState,
            next: null
          }, V === null ? (T = V = ee, h = c) : V = V.next = ee, Xe.lanes |= de, co |= de;
        W = W.next;
      } while (W !== null && W !== t);
      if (V === null ? h = c : V.next = T, !Nn(c, e.memoizedState) && ($t = !0, ce && (l = zr, l !== null)))
        throw l;
      e.memoizedState = c, e.baseState = h, e.baseQueue = V, r.lastRenderedState = c;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function vf(e) {
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
    if (h && (s.memoizedState = l, $t = !0), s = s.queue, Sf(km.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || h || Jt !== null && Jt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Hr(
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
      c || (Rl & 127) !== 0 || Dm(r, t, l);
    }
    return l;
  }
  function Dm(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = as(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
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
    var t = Bo(e, 2);
    t !== null && On(t, e, 2);
  }
  function bf(e) {
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
  function Um(e, t, l, r) {
    return e.baseState = l, yf(
      e,
      wt,
      typeof r == "function" ? r : Cl
    );
  }
  function Ew(e, t, l, r, s) {
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
      R.T !== null ? l(!0) : c.isTransition = !1, r(c), l = t.pending, l === null ? (c.next = t.pending = c, Lm(t, c)) : (c.next = l.next, t.pending = l.next = c);
    }
  }
  function Lm(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var c = R.T, h = {};
      R.T = h;
      try {
        var T = l(s, r), V = R.S;
        V !== null && V(h, T), Im(e, t, T);
      } catch (W) {
        xf(e, t, W);
      } finally {
        c !== null && h.types !== null && (c.types = h.types), R.T = c;
      }
    } else
      try {
        c = l(s, r), Im(e, t, c);
      } catch (W) {
        xf(e, t, W);
      }
  }
  function Im(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Bm(e, t, r);
      },
      function(r) {
        return xf(e, t, r);
      }
    ) : Bm(e, t, l);
  }
  function Bm(e, t, l) {
    t.status = "fulfilled", t.value = l, Vm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, Lm(e, l)));
  }
  function xf(e, t, l) {
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
      lastRenderedReducer: Pm,
      lastRenderedState: t
    }, l.queue = r, l = sh.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = bf(!1), c = Cf.bind(
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
    if (t = yf(
      e,
      t,
      Pm
    )[0], e = ss(Cl)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = Na(t);
      } catch (h) {
        throw h === Nr ? $i : h;
      }
    else r = t;
    t = Kt();
    var s = t.queue, c = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Hr(
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
  function Hr(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = as(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function Fm() {
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
    wt !== null && r !== null && ff(r, wt.memoizedState.deps) ? s.memoizedState = Hr(t, c, l, r) : (Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      c,
      l,
      r
    ));
  }
  function Km(e, t) {
    cs(8390656, 8, e, t);
  }
  function Sf(e, t) {
    us(2048, 8, e, t);
  }
  function Rw(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = as(), Xe.updateQueue = t, t.events = [e];
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
    return us(4, 2, e, t);
  }
  function Jm(e, t) {
    return us(4, 4, e, t);
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
    l = l != null ? l.concat([e]) : null, us(4, 4, $m.bind(null, t, e), l);
  }
  function wf() {
  }
  function eh(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && ff(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function th(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && ff(t, r[1]))
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
  function Ef(e, t, l) {
    return l === void 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = ny(), Xe.lanes |= e, co |= e, l);
  }
  function nh(e, t, l, r) {
    return Nn(l, t) ? l : jr.current !== null ? (e = Ef(e, l, r), Nn(e, t) || ($t = !0), e) : (Rl & 42) === 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? ($t = !0, e.memoizedState = l) : (e = ny(), Xe.lanes |= e, co |= e, t);
  }
  function lh(e, t, l, r, s) {
    var c = B.p;
    B.p = c !== 0 && 8 > c ? c : 8;
    var h = R.T, T = {};
    R.T = T, Cf(e, !1, t, l);
    try {
      var V = s(), W = R.S;
      if (W !== null && W(T, V), V !== null && typeof V == "object" && typeof V.then == "function") {
        var ce = xw(
          V,
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
      B.p = c, h !== null && T.types !== null && (h.types = T.types), R.T = h;
    }
  }
  function Cw() {
  }
  function Tf(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = oh(e).queue;
    lh(
      e,
      s,
      t,
      P,
      l === null ? Cw : function() {
        return rh(e), l(r);
      }
    );
  }
  function oh(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: P,
      baseState: P,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Cl,
        lastRenderedState: P
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
  function rh(e) {
    var t = oh(e);
    t.next === null && (t = e.alternate.memoizedState), Da(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function Rf() {
    return fn(Qa);
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
          e = lo(l);
          var r = oo(t, e, l);
          r !== null && (On(r, t, l), Oa(r, t, l)), t = { cache: Wu() }, e.payload = t;
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
    }, fs(e) ? ch(t, l) : (l = Pu(e, t, l, r), l !== null && (On(l, e, r), uh(l, t, r)));
  }
  function sh(e, t, l) {
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
    if (fs(e)) ch(t, s);
    else {
      var c = e.alternate;
      if (e.lanes === 0 && (c === null || c.lanes === 0) && (c = t.lastRenderedReducer, c !== null))
        try {
          var h = t.lastRenderedState, T = c(h, l);
          if (s.hasEagerState = !0, s.eagerState = T, Nn(T, h))
            return qi(e, t, s, 0), Mt === null && Gi(), !1;
        } catch {
        }
      if (l = Pu(e, t, s, r), l !== null)
        return On(l, e, r), uh(l, t, r), !0;
    }
    return !1;
  }
  function Cf(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: od(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, fs(e)) {
      if (t) throw Error(i(479));
    } else
      t = Pu(
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
  function ch(e, t) {
    kr = os = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function uh(e, t, l) {
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
  var fh = {
    readContext: fn,
    use: is,
    useCallback: function(e, t) {
      return yn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: Km,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, cs(
        4194308,
        4,
        $m.bind(null, t, e),
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
      e = bf(e);
      var t = e.queue, l = sh.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: wf,
    useDeferredValue: function(e, t) {
      var l = yn();
      return Ef(l, e, t);
    },
    useTransition: function() {
      var e = bf(!1);
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
      ]), r.flags |= 2048, Hr(
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
        l = (r & ~(1 << 32 - yt(r) - 1)).toString(32) + l, t = "_" + t + "R_" + l, l = rs++, 0 < l && (t += "H" + l.toString(32)), t += "_";
      } else
        l = Sw++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: Rf,
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
      return t.queue = l, t = Cf.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: hf,
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
  }, Of = {
    readContext: fn,
    use: is,
    useCallback: eh,
    useContext: fn,
    useEffect: Sf,
    useImperativeHandle: Wm,
    useInsertionEffect: Zm,
    useLayoutEffect: Jm,
    useMemo: th,
    useReducer: ss,
    useRef: Fm,
    useState: function() {
      return ss(Cl);
    },
    useDebugValue: wf,
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
      var e = ss(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Na(e),
        t
      ];
    },
    useSyncExternalStore: Nm,
    useId: ah,
    useHostTransitionStatus: Rf,
    useFormState: Gm,
    useActionState: Gm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return Um(l, wt, e, t);
    },
    useMemoCache: hf,
    useCacheRefresh: ih
  };
  Of.useEffectEvent = Qm;
  var dh = {
    readContext: fn,
    use: is,
    useCallback: eh,
    useContext: fn,
    useEffect: Sf,
    useImperativeHandle: Wm,
    useInsertionEffect: Zm,
    useLayoutEffect: Jm,
    useMemo: th,
    useReducer: vf,
    useRef: Fm,
    useState: function() {
      return vf(Cl);
    },
    useDebugValue: wf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return wt === null ? Ef(l, e, t) : nh(
        l,
        wt.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = vf(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Na(e),
        t
      ];
    },
    useSyncExternalStore: Nm,
    useId: ah,
    useHostTransitionStatus: Rf,
    useFormState: Xm,
    useActionState: Xm,
    useOptimistic: function(e, t) {
      var l = Kt();
      return wt !== null ? Um(l, wt, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: hf,
    useCacheRefresh: ih
  };
  dh.useEffectEvent = Qm;
  function Mf(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : x({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var Af = {
    enqueueSetState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = lo(r);
      s.payload = t, l != null && (s.callback = l), t = oo(e, s, r), t !== null && (On(t, e, r), Oa(t, e, r));
    },
    enqueueReplaceState: function(e, t, l) {
      e = e._reactInternals;
      var r = Un(), s = lo(r);
      s.tag = 1, s.payload = t, l != null && (s.callback = l), t = oo(e, s, r), t !== null && (On(t, e, r), Oa(t, e, r));
    },
    enqueueForceUpdate: function(e, t) {
      e = e._reactInternals;
      var l = Un(), r = lo(l);
      r.tag = 2, t != null && (r.callback = t), t = oo(e, r, l), t !== null && (On(t, e, l), Oa(t, e, l));
    }
  };
  function ph(e, t, l, r, s, c, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, c, h) : t.prototype && t.prototype.isPureReactComponent ? !ba(l, r) || !ba(s, c) : !0;
  }
  function gh(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && Af.enqueueReplaceState(t, t.state, null);
  }
  function Zo(e, t) {
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
    Yi(e);
  }
  function hh(e) {
    console.error(e);
  }
  function yh(e) {
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
  function zf(e, t, l) {
    return l = lo(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      ds(e, t);
    }, l;
  }
  function bh(e) {
    return e = lo(e), e.tag = 3, e;
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
      vh(t, l, r), typeof s != "function" && (uo === null ? uo = /* @__PURE__ */ new Set([this]) : uo.add(this));
      var T = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: T !== null ? T : ""
      });
    });
  }
  function Aw(e, t, l, r, s) {
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
            return Zn === null ? Ts() : l.alternate === null && Vt === 0 && (Vt = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === Wi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), td(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === Wi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), td(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return td(e, r, s), Ts(), !1;
    }
    if (st)
      return t = jn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== Ku && (e = Error(i(422), { cause: r }), wa(Xn(e, l)))) : (r !== Ku && (t = Error(i(423), {
        cause: r
      }), wa(
        Xn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Xn(r, l), s = zf(
        e.stateNode,
        r,
        s
      ), rf(e, s), Vt !== 4 && (Vt = 2)), !1;
    var c = Error(i(520), { cause: r });
    if (c = Xn(c, l), Va === null ? Va = [c] : Va.push(c), Vt !== 4 && (Vt = 2), t === null) return !0;
    r = Xn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = zf(l.stateNode, r, e), rf(l, e), !1;
        case 1:
          if (t = l.type, c = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || c !== null && typeof c.componentDidCatch == "function" && (uo === null || !uo.has(c))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = bh(s), xh(
              s,
              e,
              l,
              r
            ), rf(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Nf = Error(i(461)), $t = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? Tm(t, null, l, r) : Ko(
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
      for (var T in r)
        T !== "ref" && (h[T] = r[T]);
    } else h = r;
    return Go(t), r = df(
      e,
      t,
      l,
      h,
      c,
      s
    ), T = pf(), e !== null && !$t ? (gf(e, t, s), Ol(e, t, s)) : (st && T && Xu(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function wh(e, t, l, r, s) {
    if (e === null) {
      var c = l.type;
      return typeof c == "function" && !Yu(c) && c.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = c, Eh(
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
    if (c = e.child, !If(e, s)) {
      var h = c.memoizedProps;
      if (l = l.compare, l = l !== null ? l : ba, l(h, r) && e.ref === t.ref)
        return Ol(e, t, s);
    }
    return t.flags |= 1, e = Sl(c, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function Eh(e, t, l, r, s) {
    if (e !== null) {
      var c = e.memoizedProps;
      if (ba(c, r) && e.ref === t.ref)
        if ($t = !1, t.pendingProps = r = c, If(e, s))
          (e.flags & 131072) !== 0 && ($t = !0);
        else
          return t.lanes = e.lanes, Ol(e, t, s);
    }
    return Df(
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
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Ji(
          t,
          c !== null ? c.cachePool : null
        ), c !== null ? Om(t, c) : sf(), Mm(t);
      else
        return r = t.lanes = 536870912, Rh(
          e,
          t,
          c !== null ? c.baseLanes | l : l,
          l,
          r
        );
    } else
      c !== null ? (Ji(t, c.cachePool), Om(t, c), ao(), t.memoizedState = null) : (e !== null && Ji(t, null), sf(), ao());
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
  function Rh(e, t, l, r, s) {
    var c = tf();
    return c = c === null ? null : { parent: Zt._currentValue, pool: c }, t.memoizedState = {
      baseLanes: l,
      cachePool: c
    }, e !== null && Ji(t, null), sf(), Mm(t), e !== null && Mr(e, t, r, !0), t.childLanes = s, null;
  }
  function ps(e, t) {
    return t = ms(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Ch(e, t, l) {
    return Ko(t, e.child, null, l), e = ps(t, t.pendingProps), e.flags |= 2, kn(t), t.memoizedState = null, e;
  }
  function zw(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = ps(t, r), t.lanes = 536870912, ka(null, e);
        if (uf(t), (e = kt) ? (e = Ly(
          e,
          Qn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = cm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw eo(t);
        return t.lanes = 536870912, null;
      }
      return ps(t, r);
    }
    var c = e.memoizedState;
    if (c !== null) {
      var h = c.dehydrated;
      if (uf(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = Ch(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if ($t || Mr(e, t, l, !1), s = (l & e.childLanes) !== 0, $t || s) {
        if (r = Mt, r !== null && (h = yl(r, l), h !== 0 && h !== c.retryLane))
          throw c.retryLane = h, Bo(e, h), On(r, e, h), Nf;
        Ts(), t = Ch(
          e,
          t,
          l
        );
      } else
        e = c.treeContext, kt = Jn(h.nextSibling), un = t, st = !0, Wl = null, Qn = !1, e !== null && dm(t, e), t = ps(t, r), t.flags |= 4096;
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
  function Df(e, t, l, r, s) {
    return Go(t), l = df(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = pf(), e !== null && !$t ? (gf(e, t, s), Ol(e, t, s)) : (st && r && Xu(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function Oh(e, t, l, r, s, c) {
    return Go(t), t.updateQueue = null, l = zm(
      t,
      r,
      l,
      s
    ), Am(e), r = pf(), e !== null && !$t ? (gf(e, t, c), Ol(e, t, c)) : (st && r && Xu(t), t.flags |= 1, dn(e, t, l, c), t.child);
  }
  function Mh(e, t, l, r, s) {
    if (Go(t), t.stateNode === null) {
      var c = Tr, h = l.contextType;
      typeof h == "object" && h !== null && (c = fn(h)), c = new l(r, c), t.memoizedState = c.state !== null && c.state !== void 0 ? c.state : null, c.updater = Af, t.stateNode = c, c._reactInternals = t, c = t.stateNode, c.props = r, c.state = t.memoizedState, c.refs = {}, lf(t), h = l.contextType, c.context = typeof h == "object" && h !== null ? fn(h) : Tr, c.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (Mf(
        t,
        l,
        h,
        r
      ), c.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof c.getSnapshotBeforeUpdate == "function" || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (h = c.state, typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount(), h !== c.state && Af.enqueueReplaceState(c, c.state, null), Aa(t, r, c, s), Ma(), c.state = t.memoizedState), typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      c = t.stateNode;
      var T = t.memoizedProps, V = Zo(l, T);
      c.props = V;
      var W = c.context, ce = l.contextType;
      h = Tr, typeof ce == "object" && ce !== null && (h = fn(ce));
      var de = l.getDerivedStateFromProps;
      ce = typeof de == "function" || typeof c.getSnapshotBeforeUpdate == "function", T = t.pendingProps !== T, ce || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (T || W !== h) && gh(
        t,
        c,
        r,
        h
      ), no = !1;
      var ee = t.memoizedState;
      c.state = ee, Aa(t, r, c, s), Ma(), W = t.memoizedState, T || ee !== W || no ? (typeof de == "function" && (Mf(
        t,
        l,
        de,
        r
      ), W = t.memoizedState), (V = no || ph(
        t,
        l,
        V,
        r,
        ee,
        W,
        h
      )) ? (ce || typeof c.UNSAFE_componentWillMount != "function" && typeof c.componentWillMount != "function" || (typeof c.componentWillMount == "function" && c.componentWillMount(), typeof c.UNSAFE_componentWillMount == "function" && c.UNSAFE_componentWillMount()), typeof c.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = W), c.props = r, c.state = W, c.context = h, r = V) : (typeof c.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      c = t.stateNode, of(e, t), h = t.memoizedProps, ce = Zo(l, h), c.props = ce, de = t.pendingProps, ee = c.context, W = l.contextType, V = Tr, typeof W == "object" && W !== null && (V = fn(W)), T = l.getDerivedStateFromProps, (W = typeof T == "function" || typeof c.getSnapshotBeforeUpdate == "function") || typeof c.UNSAFE_componentWillReceiveProps != "function" && typeof c.componentWillReceiveProps != "function" || (h !== de || ee !== V) && gh(
        t,
        c,
        r,
        V
      ), no = !1, ee = t.memoizedState, c.state = ee, Aa(t, r, c, s), Ma();
      var le = t.memoizedState;
      h !== de || ee !== le || no || e !== null && e.dependencies !== null && Qi(e.dependencies) ? (typeof T == "function" && (Mf(
        t,
        l,
        T,
        r
      ), le = t.memoizedState), (ce = no || ph(
        t,
        l,
        ce,
        r,
        ee,
        le,
        V
      ) || e !== null && e.dependencies !== null && Qi(e.dependencies)) ? (W || typeof c.UNSAFE_componentWillUpdate != "function" && typeof c.componentWillUpdate != "function" || (typeof c.componentWillUpdate == "function" && c.componentWillUpdate(r, le, V), typeof c.UNSAFE_componentWillUpdate == "function" && c.UNSAFE_componentWillUpdate(
        r,
        le,
        V
      )), typeof c.componentDidUpdate == "function" && (t.flags |= 4), typeof c.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = le), c.props = r, c.state = le, c.context = V, r = ce) : (typeof c.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof c.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), r = !1);
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
  function Ah(e, t, l, r) {
    return Po(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var jf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function kf(e) {
    return { baseLanes: e, cachePool: vm() };
  }
  function _f(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function zh(e, t, l) {
    var r = t.pendingProps, s = !1, c = (t.flags & 128) !== 0, h;
    if ((h = c) || (h = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? ro(t) : ao(), (e = kt) ? (e = Ly(
          e,
          Qn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = cm(e), l.return = t, t.child = l, un = t, kt = null)) : e = null, e === null) throw eo(t);
        return yd(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var T = r.children;
      return r = r.fallback, s ? (ao(), s = t.mode, T = ms(
        { mode: "hidden", children: T },
        s
      ), r = Vo(
        r,
        s,
        l,
        null
      ), T.return = t, r.return = t, T.sibling = r, t.child = T, r = t.child, r.memoizedState = kf(l), r.childLanes = _f(
        e,
        h,
        l
      ), t.memoizedState = jf, ka(null, r)) : (ro(t), Hf(t, T));
    }
    var V = e.memoizedState;
    if (V !== null && (T = V.dehydrated, T !== null)) {
      if (c)
        t.flags & 256 ? (ro(t), t.flags &= -257, t = Uf(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (ao(), t.child = e.child, t.flags |= 128, t = null) : (ao(), T = r.fallback, s = t.mode, r = ms(
          { mode: "visible", children: r.children },
          s
        ), T = Vo(
          T,
          s,
          l,
          null
        ), T.flags |= 2, r.return = t, T.return = t, r.sibling = T, t.child = r, Ko(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = kf(l), r.childLanes = _f(
          e,
          h,
          l
        ), t.memoizedState = jf, t = ka(null, r));
      else if (ro(t), yd(T)) {
        if (h = T.nextSibling && T.nextSibling.dataset, h) var W = h.dgst;
        h = W, r = Error(i(419)), r.stack = "", r.digest = h, wa({ value: r, source: null, stack: null }), t = Uf(
          e,
          t,
          l
        );
      } else if ($t || Mr(e, t, l, !1), h = (l & e.childLanes) !== 0, $t || h) {
        if (h = Mt, h !== null && (r = yl(h, l), r !== 0 && r !== V.retryLane))
          throw V.retryLane = r, Bo(e, r), On(h, e, r), Nf;
        hd(T) || Ts(), t = Uf(
          e,
          t,
          l
        );
      } else
        hd(T) ? (t.flags |= 192, t.child = e.child, t = null) : (e = V.treeContext, kt = Jn(
          T.nextSibling
        ), un = t, st = !0, Wl = null, Qn = !1, e !== null && dm(t, e), t = Hf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (ao(), T = r.fallback, s = t.mode, V = e.child, W = V.sibling, r = Sl(V, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = V.subtreeFlags & 65011712, W !== null ? T = Sl(
      W,
      T
    ) : (T = Vo(
      T,
      s,
      l,
      null
    ), T.flags |= 2), T.return = t, r.return = t, r.sibling = T, t.child = r, ka(null, r), r = t.child, T = e.child.memoizedState, T === null ? T = kf(l) : (s = T.cachePool, s !== null ? (V = Zt._currentValue, s = s.parent !== V ? { parent: V, pool: V } : s) : s = vm(), T = {
      baseLanes: T.baseLanes | l,
      cachePool: s
    }), r.memoizedState = T, r.childLanes = _f(
      e,
      h,
      l
    ), t.memoizedState = jf, ka(e.child, r)) : (ro(t), l = e.child, e = l.sibling, l = Sl(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function Hf(e, t) {
    return t = ms(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ms(e, t) {
    return e = Dn(22, e, null, t), e.lanes = 0, e;
  }
  function Uf(e, t, l) {
    return Ko(t, e.child, null, l), e = Hf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function Nh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), Ju(e.return, t, l);
  }
  function Lf(e, t, l, r, s, c) {
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
    var h = Ft.current, T = (h & 2) !== 0;
    if (T ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, te(Ft, h), dn(e, t, r, l), r = st ? Sa : 0, !T && e !== null && (e.flags & 128) !== 0)
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
          e = l.alternate, e !== null && ls(e) === null && (s = l), l = l.sibling;
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), Lf(
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
        Lf(
          t,
          !0,
          l,
          null,
          c,
          r
        );
        break;
      case "together":
        Lf(
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
  function If(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Qi(e)));
  }
  function Nw(e, t, l) {
    switch (t.tag) {
      case 3:
        se(t, t.stateNode.containerInfo), to(t, Zt, e.memoizedState.cache), Po();
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
          return t.flags |= 128, uf(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (ro(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? zh(e, t, l) : (ro(t), e = Ol(
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
            return Dh(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), te(Ft, Ft.current), r) break;
        return null;
      case 22:
        return t.lanes = 0, Th(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        to(t, Zt, e.memoizedState.cache);
    }
    return Ol(e, t, l);
  }
  function jh(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        $t = !0;
      else {
        if (!If(e, l) && (t.flags & 128) === 0)
          return $t = !1, Nw(
            e,
            t,
            l
          );
        $t = (e.flags & 131072) !== 0;
      }
    else
      $t = !1, st && (t.flags & 1048576) !== 0 && fm(t, Sa, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = Xo(t.elementType), t.type = e, typeof e == "function")
            Yu(e) ? (r = Zo(e, r), t.tag = 1, t = Mh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = Df(
              null,
              t,
              e,
              r,
              l
            ));
          else {
            if (e != null) {
              var s = e.$$typeof;
              if (s === z) {
                t.tag = 11, t = Sh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === H) {
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
            throw t = Q(e) || e, Error(i(306, t, ""));
          }
        }
        return t;
      case 0:
        return Df(
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
          s = c.element, of(e, t), Aa(t, r, null, l);
          var h = t.memoizedState;
          if (r = h.cache, to(t, Zt, r), r !== c.cache && $u(
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
              ), wa(s), t = Ah(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, kt = Jn(e.firstChild), un = t, st = !0, Wl = null, Qn = !0, l = Tm(
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
        return gs(e, t), e === null ? (l = Gy(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ns(
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
        ), un = t, Qn = !0, s = kt, mo(t.type) ? (vd = s, kt = Jn(r.firstChild)) : kt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), gs(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = kt) && (r = i1(
          r,
          t.type,
          t.pendingProps,
          Qn
        ), r !== null ? (t.stateNode = r, un = t, kt = Jn(r.firstChild), Qn = !1, s = !0) : s = !1), s || eo(t)), je(t), s = t.type, c = t.pendingProps, h = e !== null ? e.memoizedProps : null, r = c.children, pd(s, c) ? r = null : h !== null && pd(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = df(
          e,
          t,
          ww,
          null,
          null,
          l
        ), Qa._currentValue = s), gs(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = kt) && (l = s1(
          l,
          t.pendingProps,
          Qn
        ), l !== null ? (t.stateNode = l, un = t, kt = null, e = !0) : e = !1), e || eo(t)), null;
      case 13:
        return zh(e, t, l);
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
        return r = t.pendingProps, to(t, t.type, r.value), dn(e, t, r.children, l), t.child;
      case 9:
        return s = t.type._context, r = t.pendingProps.children, Go(t), s = fn(s), r = r(s), t.flags |= 1, dn(e, t, r, l), t.child;
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
        return Go(t), r = fn(Zt), e === null ? (s = tf(), s === null && (s = Mt, c = Wu(), s.pooledCache = c, c.refCount++, c !== null && (s.pooledCacheLanes |= l), s = c), t.memoizedState = { parent: r, cache: s }, lf(t), to(t, Zt, s)) : ((e.lanes & l) !== 0 && (of(e, t), Aa(t, null, null, l), Ma()), s = e.memoizedState, c = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), to(t, Zt, r)) : (r = c.cache, to(t, Zt, r), r !== s.cache && $u(
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
  function Bf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (ay()) e.flags |= 8192;
        else
          throw Fo = Wi, nf;
    } else e.flags &= -16777217;
  }
  function kh(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !Qy(t))
      if (ay()) e.flags |= 8192;
      else
        throw Fo = Wi, nf;
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
    switch (Fu(t), t.tag) {
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
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Tl(Zt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Or(t) ? Ml(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Qu())), _t(t), null;
      case 26:
        var s = t.type, c = t.memoizedState;
        return e === null ? (Ml(t), c !== null ? (_t(t), kh(t, c)) : (_t(t), Bf(
          t,
          s,
          null,
          r,
          l
        ))) : c ? c !== e.memoizedState ? (Ml(t), _t(t), kh(t, c)) : (_t(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && Ml(t), _t(t), Bf(
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
          e = J.current, Or(t) ? pm(t) : (e = Vy(s, r, l), t.stateNode = e, Ml(t));
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
            pm(t);
          else {
            var h = Ns(
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
        return _t(t), Bf(
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
            e[Ot] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || zy(e.nodeValue, l)), e || eo(t, !0);
          } else
            e = Ns(e).createTextNode(
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
            l = Qu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
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
            s = Qu(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
        }
        return kn(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), c = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (c = r.memoizedState.cachePool.pool), c !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), hs(t, t.updateQueue), _t(t), null);
      case 4:
        return ge(), e === null && sd(t.stateNode.containerInfo), _t(t), null;
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
                    sm(l, e), l = l.sibling;
                  return te(
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
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, te(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && wl(t, r.treeForkCount), e) : (_t(t), null);
      case 22:
      case 23:
        return kn(t), cf(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (_t(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : _t(t), l = t.updateQueue, l !== null && hs(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && U(qo), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Tl(Zt), _t(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function jw(e, t) {
    switch (Fu(t), t.tag) {
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
        return kn(t), cf(), e !== null && U(qo), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Tl(Zt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function _h(e, t) {
    switch (Fu(t), t.tag) {
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
        kn(t), cf(), e !== null && U(qo);
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
    } catch (T) {
      bt(t, t.return, T);
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
              var V = l, W = T;
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
  function Vf(e, t, l) {
    try {
      var r = e.stateNode;
      t1(r, e.type, l, t), r[cn] = t;
    } catch (s) {
      bt(e, e.return, s);
    }
  }
  function Ih(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && mo(e.type) || e.tag === 4;
  }
  function Pf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || Ih(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && mo(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function Yf(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = bl));
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (Yf(e, t, l), e = e.sibling; e !== null; )
        Yf(e, t, l), e = e.sibling;
  }
  function ys(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (ys(e, t, l), e = e.sibling; e !== null; )
        ys(e, t, l), e = e.sibling;
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
  var Al = !1, Wt = !1, Gf = !1, Vh = typeof WeakSet == "function" ? WeakSet : Set, rn = null;
  function kw(e, t) {
    if (e = e.containerInfo, fd = Ls, e = Wg(e), Hu(e)) {
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
            var h = 0, T = -1, V = -1, W = 0, ce = 0, de = e, ee = null;
            t: for (; ; ) {
              for (var le; de !== l || s !== 0 && de.nodeType !== 3 || (T = h + s), de !== c || r !== 0 && de.nodeType !== 3 || (V = h + r), de.nodeType === 3 && (h += de.nodeValue.length), (le = de.firstChild) !== null; )
                ee = de, de = le;
              for (; ; ) {
                if (de === e) break t;
                if (ee === l && ++W === s && (T = h), ee === c && ++ce === r && (V = h), (le = de.nextSibling) !== null) break;
                de = ee, ee = de.parentNode;
              }
              de = le;
            }
            l = T === -1 || V === -1 ? null : { start: T, end: V };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (dd = { focusedElem: e, selectionRange: l }, Ls = !1, rn = t; rn !== null; )
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
                  var Ne = Zo(
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
                  md(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      md(e);
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
        Nl(e, l), r & 4 && Ha(5, l);
        break;
      case 1:
        if (Nl(e, l), r & 4)
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
        r & 64 && Hh(l), r & 512 && Ua(l, l.return);
        break;
      case 3:
        if (Nl(e, l), r & 64 && (e = l.updateQueue, e !== null)) {
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
        Nl(e, l), t === null && r & 4 && Lh(l), r & 512 && Ua(l, l.return);
        break;
      case 12:
        Nl(e, l);
        break;
      case 31:
        Nl(e, l), r & 4 && qh(e, l);
        break;
      case 13:
        Nl(e, l), r & 4 && Xh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = Yw.bind(
          null,
          l
        ), c1(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || Al, !r) {
          t = t !== null && t.memoizedState !== null || Wt, s = Al;
          var c = Wt;
          Al = r, (Wt = t) && !c ? Dl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Nl(e, l), Al = s, Wt = c;
        }
        break;
      case 30:
        break;
      default:
        Nl(e, l);
    }
  }
  function Yh(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, Yh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && bu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, En = !1;
  function zl(e, t, l) {
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
        Wt || sl(l, t), zl(
          e,
          t,
          l
        ), l.memoizedState ? l.memoizedState.count-- : l.stateNode && (l = l.stateNode, l.parentNode.removeChild(l));
        break;
      case 27:
        Wt || sl(l, t);
        var r = Lt, s = En;
        mo(l.type) && (Lt = l.stateNode, En = !1), zl(
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
        Lt !== null && (En ? (e = Lt, Hy(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), Kr(e)) : Hy(Lt, l.stateNode));
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
        io(2, l, t), Wt || io(4, l, t), zl(
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
  function qh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Kr(e);
      } catch (l) {
        bt(t, t.return, l);
      }
    }
  }
  function Xh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        Kr(e);
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
  function vs(e, t) {
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
        Tn(t, e), Rn(e), r & 4 && (io(3, e, e.return), Ha(3, e), io(5, e, e.return));
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
                      var h = Fy(
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
                      if (h = Fy(
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
            )) : r === null && e.stateNode !== null && Vf(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Tn(t, e), Rn(e), r & 512 && (Wt || l === null || sl(l, l.return)), l !== null && r & 4 && Vf(
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
          } catch (Ne) {
            bt(e, e.return, Ne);
          }
        }
        r & 4 && e.stateNode != null && (s = e.memoizedProps, Vf(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (Gf = !0);
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
        if (ks = null, s = ll, ll = Ds(t.containerInfo), Tn(t, e), ll = s, Rn(e), r & 4 && l !== null && l.memoizedState.isDehydrated)
          try {
            Kr(t.containerInfo);
          } catch (Ne) {
            bt(e, e.return, Ne);
          }
        Gf && (Gf = !1, Kh(e));
        break;
      case 4:
        r = ll, ll = Ds(
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
        var V = l !== null && l.memoizedState !== null, W = Al, ce = Wt;
        if (Al = W || s, Wt = ce || V, Tn(t, e), Wt = ce, Al = W, Rn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || V || Al || Wt || Jo(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                V = l = t;
                try {
                  if (c = V.stateNode, s)
                    h = c.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    T = V.stateNode;
                    var de = V.memoizedProps.style, ee = de != null && de.hasOwnProperty("display") ? de.display : null;
                    T.style.display = ee == null || typeof ee == "boolean" ? "" : ("" + ee).trim();
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
          if (Ih(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, c = Pf(e);
            ys(e, c, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (yr(h, ""), l.flags &= -33);
            var T = Pf(e);
            ys(e, T, h);
            break;
          case 3:
          case 4:
            var V = l.stateNode.containerInfo, W = Pf(e);
            Yf(
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
  function Nl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Ph(e, t.alternate, t), t = t.sibling;
  }
  function Jo(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          io(4, t, t.return), Jo(t);
          break;
        case 1:
          sl(t, t.return);
          var l = t.stateNode;
          typeof l.componentWillUnmount == "function" && Uh(
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
  function Dl(e, t, l) {
    for (l = l && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var r = t.alternate, s = e, c = t, h = c.flags;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          Dl(
            s,
            c,
            l
          ), Ha(4, c);
          break;
        case 1:
          if (Dl(
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
            var T = r.stateNode;
            try {
              var V = s.shared.hiddenCallbacks;
              if (V !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < V.length; s++)
                  Rm(V[s], T);
            } catch (W) {
              bt(r, r.return, W);
            }
          }
          l && h & 64 && Hh(c), Ua(c, c.return);
          break;
        case 27:
          Bh(c);
        case 26:
        case 5:
          Dl(
            s,
            c,
            l
          ), l && r === null && h & 4 && Lh(c), Ua(c, c.return);
          break;
        case 12:
          Dl(
            s,
            c,
            l
          );
          break;
        case 31:
          Dl(
            s,
            c,
            l
          ), l && h & 4 && qh(s, c);
          break;
        case 13:
          Dl(
            s,
            c,
            l
          ), l && h & 4 && Xh(s, c);
          break;
        case 22:
          c.memoizedState === null && Dl(
            s,
            c,
            l
          ), Ua(c, c.return);
          break;
        case 30:
          break;
        default:
          Dl(
            s,
            c,
            l
          );
      }
      t = t.sibling;
    }
  }
  function qf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && Ea(l));
  }
  function Xf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ea(e));
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
            var c = t.memoizedProps, h = c.id, T = c.onPostCommit;
            typeof T == "function" && T(
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
        )), s & 2048 && qf(h, t);
        break;
      case 24:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Xf(t.alternate, t);
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
      var c = e, h = t, T = l, V = r, W = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          Ur(
            c,
            h,
            T,
            V,
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
            T,
            V,
            s
          ) : La(
            c,
            h
          ) : (ce._visibility |= 2, Ur(
            c,
            h,
            T,
            V,
            s
          )), s && W & 2048 && qf(
            h.alternate,
            h
          );
          break;
        case 24:
          Ur(
            c,
            h,
            T,
            V,
            s
          ), s && W & 2048 && Xf(h.alternate, h);
          break;
        default:
          Ur(
            c,
            h,
            T,
            V,
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
            La(l, r), s & 2048 && qf(
              r.alternate,
              r
            );
            break;
          case 24:
            La(l, r), s & 2048 && Xf(r.alternate, r);
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
        Zh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function Zh(e, t, l) {
    switch (e.tag) {
      case 26:
        Lr(
          e,
          t,
          l
        ), e.flags & Ia && e.memoizedState !== null && S1(
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
        ll = Ds(e.stateNode.containerInfo), Lr(
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
  function Jh(e) {
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
        Ba(e), e.flags & 2048 && io(9, e, e.return);
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
          io(8, t, t.return), bs(t);
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
  function Wh(e, t) {
    for (; rn !== null; ) {
      var l = rn;
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
          Ea(l.memoizedState.cache);
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
  }, Uw = typeof WeakMap == "function" ? WeakMap : Map, gt = 0, Mt = null, lt = null, at = 0, vt = 0, _n = null, so = !1, Ir = !1, Ff = !1, jl = 0, Vt = 0, co = 0, $o = 0, Kf = 0, Hn = 0, Br = 0, Va = null, Cn = null, Qf = !1, xs = 0, ey = 0, Ss = 1 / 0, ws = null, uo = null, tn = 0, fo = null, Vr = null, kl = 0, Zf = 0, Jf = null, ty = null, Pa = 0, $f = null;
  function Un() {
    return (gt & 2) !== 0 && at !== 0 ? at & -at : R.T !== null ? od() : Xt();
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
    (e === Mt && (vt === 2 || vt === 9) || e.cancelPendingCommit !== null) && (Pr(e, 0), po(
      e,
      at,
      Hn,
      !1
    )), qt(e, l), ((gt & 2) === 0 || e !== Mt) && (e === Mt && ((gt & 2) === 0 && ($o |= l), Vt === 4 && po(
      e,
      at,
      Hn,
      !1
    )), cl(e));
  }
  function ly(e, t, l) {
    if ((gt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? Bw(e, t) : ed(e, t, !0), c = r;
    do {
      if (s === 0) {
        Ir && !r && po(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, c && !Lw(l)) {
          s = ed(e, t, !1), c = !1;
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
              s = Va;
              var V = T.current.memoizedState.isDehydrated;
              if (V && (Pr(T, h).flags |= 256), h = ed(
                T,
                h,
                !1
              ), h !== 2) {
                if (Ff && !V) {
                  T.errorRecoveryDisabledLanes |= c, $o |= c, s = 4;
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
          if ((t & 62914560) === t && (s = xs + 300 - ae(), 10 < s)) {
            if (po(
              r,
              t,
              Hn,
              !so
            ), jt(r, 0, !0) !== 0) break e;
            kl = t, r.timeoutHandle = ky(
              oy.bind(
                null,
                r,
                l,
                Cn,
                ws,
                Qf,
                t,
                Hn,
                $o,
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
          oy(
            r,
            l,
            Cn,
            ws,
            Qf,
            t,
            Hn,
            $o,
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
  function oy(e, t, l, r, s, c, h, T, V, W, ce, de, ee, le) {
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
      }, Zh(
        t,
        c,
        de
      );
      var Ne = (c & 62914560) === c ? xs - ae() : (c & 4194048) === c ? ey - ae() : 0;
      if (Ne = w1(
        de,
        Ne
      ), Ne !== null) {
        kl = c, e.cancelPendingCommit = Ne(
          dy.bind(
            null,
            e,
            t,
            c,
            l,
            r,
            s,
            h,
            T,
            V,
            ce,
            de,
            null,
            ee,
            le
          )
        ), po(e, c, h, !W);
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
      T,
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
  function po(e, t, l, r) {
    t &= ~Kf, t &= ~$o, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var c = 31 - yt(s), h = 1 << c;
      r[c] = -1, s &= ~h;
    }
    l !== 0 && hl(e, l, t);
  }
  function Es() {
    return (gt & 6) === 0 ? (Ya(0), !1) : !0;
  }
  function Wf() {
    if (lt !== null) {
      if (vt === 0)
        var e = lt.return;
      else
        e = lt, El = Yo = null, mf(e), Dr = null, Ra = 0, e = lt;
      for (; e !== null; )
        _h(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Pr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, o1(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), kl = 0, Wf(), Mt = e, lt = l = Sl(e.current, null), at = t, vt = 0, _n = null, so = !1, Ir = Gt(e, t), Ff = !1, Br = Hn = Kf = $o = co = Vt = 0, Cn = Va = null, Qf = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - yt(r), c = 1 << s;
        t |= e[s], r &= ~c;
      }
    return jl = t, Gi(), l;
  }
  function ry(e, t) {
    Xe = null, R.H = ja, t === Nr || t === $i ? (t = Sm(), vt = 3) : t === nf ? (t = Sm(), vt = 4) : vt = t === Nf ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, _n = t, lt === null && (Vt = 1, ds(
      e,
      Xn(t, e.current)
    ));
  }
  function ay() {
    var e = jn.current;
    return e === null ? !0 : (at & 4194048) === at ? Zn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Zn : !1;
  }
  function iy() {
    var e = R.H;
    return R.H = ja, e === null ? ja : e;
  }
  function sy() {
    var e = R.A;
    return R.A = Hw, e;
  }
  function Ts() {
    Vt = 4, so || (at & 4194048) !== at && jn.current !== null || (Ir = !0), (co & 134217727) === 0 && ($o & 134217727) === 0 || Mt === null || po(
      Mt,
      at,
      Hn,
      !1
    );
  }
  function ed(e, t, l) {
    var r = gt;
    gt |= 2;
    var s = iy(), c = sy();
    (Mt !== e || at !== t) && (ws = null, Pr(e, t)), t = !1;
    var h = Vt;
    e: do
      try {
        if (vt !== 0 && lt !== null) {
          var T = lt, V = _n;
          switch (vt) {
            case 8:
              Wf(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              jn.current === null && (t = !0);
              var W = vt;
              if (vt = 0, _n = null, Yr(e, T, V, W), l && Ir) {
                h = 0;
                break e;
              }
              break;
            default:
              W = vt, vt = 0, _n = null, Yr(e, T, V, W);
          }
        }
        Iw(), h = Vt;
        break;
      } catch (ce) {
        ry(e, ce);
      }
    while (!0);
    return t && e.shellSuspendCounter++, El = Yo = null, gt = r, R.H = s, R.A = c, lt === null && (Mt = null, at = 0, Gi()), h;
  }
  function Iw() {
    for (; lt !== null; ) cy(lt);
  }
  function Bw(e, t) {
    var l = gt;
    gt |= 2;
    var r = iy(), s = sy();
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
              bm(c) ? (vt = 0, _n = null, uy(t)) : (vt = 0, _n = null, Yr(e, t, c, 7));
              break;
            case 5:
              var h = null;
              switch (lt.tag) {
                case 26:
                  h = lt.memoizedState;
                case 5:
                case 27:
                  var T = lt;
                  if (h ? Qy(h) : T.stateNode.complete) {
                    vt = 0, _n = null;
                    var V = T.sibling;
                    if (V !== null) lt = V;
                    else {
                      var W = T.return;
                      W !== null ? (lt = W, Rs(W)) : lt = null;
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
              Wf(), Vt = 6;
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
    return El = Yo = null, R.H = r, R.A = s, gt = l, lt !== null ? 0 : (Mt = null, at = 0, Gi(), Vt);
  }
  function Vw() {
    for (; lt !== null && !Oe(); )
      cy(lt);
  }
  function cy(e) {
    var t = jh(e.alternate, e, jl);
    e.memoizedProps = e.pendingProps, t === null ? Rs(e) : lt = t;
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
        mf(t);
      default:
        _h(l, t), t = lt = sm(t, jl), t = jh(l, t, jl);
    }
    e.memoizedProps = e.pendingProps, t === null ? Rs(e) : lt = t;
  }
  function Yr(e, t, l, r) {
    El = Yo = null, mf(t), Dr = null, Ra = 0;
    var s = t.return;
    try {
      if (Aw(
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
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Ir || (at & 536870912) !== 0 ? e = !1 : (so = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = jn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), fy(t, e)) : Rs(t);
  }
  function Rs(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        fy(
          t,
          so
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
  function dy(e, t, l, r, s, c, h, T, V) {
    e.cancelPendingCommit = null;
    do
      Cs();
    while (tn !== 0);
    if ((gt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (c = t.lanes | t.childLanes, c |= Vu, Pn(
        e,
        l,
        c,
        h,
        T,
        V
      ), e === Mt && (lt = Mt = null, at = 0), Vr = t, fo = e, kl = l, Zf = c, Jf = s, ty = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, qw(be, function() {
        return yy(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = R.T, R.T = null, s = B.p, B.p = 2, h = gt, gt |= 4;
        try {
          kw(e, t, l);
        } finally {
          gt = h, B.p = s, R.T = r;
        }
      }
      tn = 1, py(), gy(), my();
    }
  }
  function py() {
    if (tn === 1) {
      tn = 0;
      var e = fo, t = Vr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = R.T, R.T = null;
        var r = B.p;
        B.p = 2;
        var s = gt;
        gt |= 4;
        try {
          Fh(t, e);
          var c = dd, h = Wg(e.containerInfo), T = c.focusedElem, V = c.selectionRange;
          if (h !== T && T && T.ownerDocument && $g(
            T.ownerDocument.documentElement,
            T
          )) {
            if (V !== null && Hu(T)) {
              var W = V.start, ce = V.end;
              if (ce === void 0 && (ce = W), "selectionStart" in T)
                T.selectionStart = W, T.selectionEnd = Math.min(
                  ce,
                  T.value.length
                );
              else {
                var de = T.ownerDocument || document, ee = de && de.defaultView || window;
                if (ee.getSelection) {
                  var le = ee.getSelection(), Ne = T.textContent.length, Ve = Math.min(V.start, Ne), Tt = V.end === void 0 ? Ve : Math.min(V.end, Ne);
                  !le.extend && Ve > Tt && (h = Tt, Tt = Ve, Ve = h);
                  var K = Jg(
                    T,
                    Ve
                  ), G = Jg(
                    T,
                    Tt
                  );
                  if (K && G && (le.rangeCount !== 1 || le.anchorNode !== K.node || le.anchorOffset !== K.offset || le.focusNode !== G.node || le.focusOffset !== G.offset)) {
                    var $ = de.createRange();
                    $.setStart(K.node, K.offset), le.removeAllRanges(), Ve > Tt ? (le.addRange($), le.extend(G.node, G.offset)) : ($.setEnd(G.node, G.offset), le.addRange($));
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
          Ls = !!fd, dd = fd = null;
        } finally {
          gt = s, B.p = r, R.T = l;
        }
      }
      e.current = t, tn = 2;
    }
  }
  function gy() {
    if (tn === 2) {
      tn = 0;
      var e = fo, t = Vr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = R.T, R.T = null;
        var r = B.p;
        B.p = 2;
        var s = gt;
        gt |= 4;
        try {
          Ph(e, t.alternate, t);
        } finally {
          gt = s, B.p = r, R.T = l;
        }
      }
      tn = 3;
    }
  }
  function my() {
    if (tn === 4 || tn === 3) {
      tn = 0, He();
      var e = fo, t = Vr, l = kl, r = ty;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? tn = 5 : (tn = 0, Vr = fo = null, hy(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (uo = null), St(l), t = t.stateNode, ht && typeof ht.onCommitFiberRoot == "function")
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
        t = R.T, s = B.p, B.p = 2, R.T = null;
        try {
          for (var c = e.onRecoverableError, h = 0; h < r.length; h++) {
            var T = r[h];
            c(T.value, {
              componentStack: T.stack
            });
          }
        } finally {
          R.T = t, B.p = s;
        }
      }
      (kl & 3) !== 0 && Cs(), cl(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === $f ? Pa++ : (Pa = 0, $f = e) : Pa = 0, Ya(0);
    }
  }
  function hy(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ea(t)));
  }
  function Cs() {
    return py(), gy(), my(), yy();
  }
  function yy() {
    if (tn !== 5) return !1;
    var e = fo, t = Zf;
    Zf = 0;
    var l = St(kl), r = R.T, s = B.p;
    try {
      B.p = 32 > l ? 32 : l, R.T = null, l = Jf, Jf = null;
      var c = fo, h = kl;
      if (tn = 0, Vr = fo = null, kl = 0, (gt & 6) !== 0) throw Error(i(331));
      var T = gt;
      if (gt |= 4, $h(c.current), Qh(
        c,
        c.current,
        h,
        l
      ), gt = T, Ya(0, !1), ht && typeof ht.onPostCommitFiberRoot == "function")
        try {
          ht.onPostCommitFiberRoot(et, c);
        } catch {
        }
      return !0;
    } finally {
      B.p = s, R.T = r, hy(e, t);
    }
  }
  function vy(e, t, l) {
    t = Xn(l, t), t = zf(e.stateNode, t, 2), e = oo(e, t, 2), e !== null && (qt(e, 2), cl(e));
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
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (uo === null || !uo.has(r))) {
            e = Xn(l, e), l = bh(2), r = oo(t, l, 2), r !== null && (xh(
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
  function td(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new Uw();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (Ff = !0, s.add(l), e = Pw.bind(null, e, t, l), t.then(e, e));
  }
  function Pw(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Mt === e && (at & l) === l && (Vt === 4 || Vt === 3 && (at & 62914560) === at && 300 > ae() - xs ? (gt & 2) === 0 && Pr(e, 0) : Kf |= l, Br === at && (Br = 0)), cl(e);
  }
  function by(e, t) {
    t === 0 && (t = zn()), e = Bo(e, t), e !== null && (qt(e, t), cl(e));
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
  var Os = null, Gr = null, nd = !1, Ms = !1, ld = !1, go = 0;
  function cl(e) {
    e !== Gr && e.next === null && (Gr === null ? Os = Gr = e : Gr = Gr.next = e), Ms = !0, nd || (nd = !0, Fw());
  }
  function Ya(e, t) {
    if (!ld && Ms) {
      ld = !0;
      do
        for (var l = !1, r = Os; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var c = 0;
            else {
              var h = r.suspendedLanes, T = r.pingedLanes;
              c = (1 << 31 - yt(42 | e) + 1) - 1, c &= s & ~(h & ~T), c = c & 201326741 ? c & 201326741 | 1 : c ? c | 2 : 0;
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
      ld = !1;
    }
  }
  function Xw() {
    xy();
  }
  function xy() {
    Ms = nd = !1;
    var e = 0;
    go !== 0 && l1() && (e = go);
    for (var t = ae(), l = null, r = Os; r !== null; ) {
      var s = r.next, c = Sy(r, t);
      c === 0 ? (r.next = null, l === null ? Os = s : l.next = s, s === null && (Gr = l)) : (l = r, (e !== 0 || (c & 3) !== 0) && (Ms = !0)), r = s;
    }
    tn !== 0 && tn !== 5 || Ya(e), go !== 0 && (go = 0);
  }
  function Sy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, c = e.pendingLanes & -62914561; 0 < c; ) {
      var h = 31 - yt(c), T = 1 << h, V = s[h];
      V === -1 ? ((T & l) === 0 || (T & r) !== 0) && (s[h] = Sn(T, t)) : V <= t && (e.expiredLanes |= T), c &= ~T;
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
    if (Cs() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = jt(
      e,
      e === Mt ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (ly(e, r, t), Sy(e, ae()), e.callbackNode != null && e.callbackNode === l ? wy.bind(null, e) : null);
  }
  function Ey(e, t) {
    if (Cs()) return null;
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
  function od() {
    if (go === 0) {
      var e = Ar;
      e === 0 && (e = pt, pt <<= 1, (pt & 261888) === 0 && (pt = 256)), go = e;
    }
    return go;
  }
  function Ty(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Hi("" + e);
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
      var T = new Bi(
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
                  var V = h ? Ry(s, h) : new FormData(s);
                  Tf(
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
                typeof c == "function" && (T.preventDefault(), V = h ? Ry(s, h) : new FormData(s), Tf(
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
  for (var rd = 0; rd < Bu.length; rd++) {
    var ad = Bu[rd], Qw = ad.toLowerCase(), Zw = ad[0].toUpperCase() + ad.slice(1);
    nl(
      Qw,
      "on" + Zw
    );
  }
  nl(nm, "onAnimationEnd"), nl(lm, "onAnimationIteration"), nl(om, "onAnimationStart"), nl("dblclick", "onDoubleClick"), nl("focusin", "onFocus"), nl("focusout", "onBlur"), nl(dw, "onTransitionRun"), nl(pw, "onTransitionStart"), nl(gw, "onTransitionCancel"), nl(rm, "onTransitionEnd"), mr("onMouseEnter", ["mouseout", "mouseover"]), mr("onMouseLeave", ["mouseout", "mouseover"]), mr("onPointerEnter", ["pointerout", "pointerover"]), mr("onPointerLeave", ["pointerout", "pointerover"]), Ho(
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
  ), Jw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Ga)
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
            var T = r[h], V = T.instance, W = T.currentTarget;
            if (T = T.listener, V !== c && s.isPropagationStopped())
              break e;
            c = T, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Yi(ce);
            }
            s.currentTarget = null, c = V;
          }
        else
          for (h = 0; h < r.length; h++) {
            if (T = r[h], V = T.instance, W = T.currentTarget, T = T.listener, V !== c && s.isPropagationStopped())
              break e;
            c = T, s.currentTarget = W;
            try {
              c(s);
            } catch (ce) {
              Yi(ce);
            }
            s.currentTarget = null, c = V;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[ca];
    l === void 0 && (l = t[ca] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (Oy(t, e, 2, !1), l.add(r));
  }
  function id(e, t, l) {
    var r = 0;
    t && (r |= 4), Oy(
      l,
      e,
      r,
      t
    );
  }
  var As = "_reactListening" + Math.random().toString(36).slice(2);
  function sd(e) {
    if (!e[As]) {
      e[As] = !0, xg.forEach(function(l) {
        l !== "selectionchange" && (Jw.has(l) || id(l, !1, e), id(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[As] || (t[As] = !0, id("selectionchange", !1, t));
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
        s = Ed;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !Ou || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function cd(e, t, l, r, s) {
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
              var V = h.tag;
              if ((V === 3 || V === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; T !== null; ) {
            if (h = dr(T), h === null) return;
            if (V = h.tag, V === 5 || V === 6 || V === 26 || V === 27) {
              r = c = h;
              continue e;
            }
            T = T.parentNode;
          }
        }
        r = r.return;
      }
    Dg(function() {
      var W = c, ce = Ru(l), de = [];
      e: {
        var ee = am.get(e);
        if (ee !== void 0) {
          var le = Bi, Ne = e;
          switch (e) {
            case "keypress":
              if (Li(l) === 0) break e;
            case "keydown":
            case "keyup":
              le = GS;
              break;
            case "focusin":
              Ne = "focus", le = Nu;
              break;
            case "focusout":
              Ne = "blur", le = Nu;
              break;
            case "beforeblur":
            case "afterblur":
              le = Nu;
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
            if ($ = ue.stateNode, ue = ue.tag, ue !== 5 && ue !== 26 && ue !== 27 || $ === null || K === null || (ue = da(G, K), ue != null && Ve.push(
              qa(G, ue, $)
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
          if (ee = e === "mouseover" || e === "pointerover", le = e === "mouseout" || e === "pointerout", ee && l !== Tu && (Ne = l.relatedTarget || l.fromElement) && (dr(Ne) || Ne[rl]))
            break e;
          if ((le || ee) && (ee = ce.window === ce ? ce : (ee = ce.ownerDocument) ? ee.defaultView || ee.parentWindow : window, le ? (Ne = l.relatedTarget || l.toElement, le = W, Ne = Ne ? dr(Ne) : null, Ne !== null && (Tt = f(Ne), Ve = Ne.tag, Ne !== Tt || Ve !== 5 && Ve !== 27 && Ve !== 6) && (Ne = null)) : (le = null, Ne = W), le !== Ne)) {
            if (Ve = _g, ue = "onMouseLeave", K = "onMouseEnter", G = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = Ug, ue = "onPointerLeave", K = "onPointerEnter", G = "pointer"), Tt = le == null ? ee : fa(le), $ = Ne == null ? ee : fa(Ne), ee = new Ve(
              ue,
              G + "leave",
              le,
              l,
              ce
            ), ee.target = Tt, ee.relatedTarget = $, ue = null, dr(ce) === W && (Ve = new Ve(
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
          if (ee = W ? fa(W) : window, le = ee.nodeName && ee.nodeName.toLowerCase(), le === "select" || le === "input" && ee.type === "file")
            var ut = qg;
          else if (Yg(ee))
            if (Xg)
              ut = cw;
            else {
              ut = iw;
              var De = aw;
            }
          else
            le = ee.nodeName, !le || le.toLowerCase() !== "input" || ee.type !== "checkbox" && ee.type !== "radio" ? W && Eu(W.elementType) && (ut = qg) : ut = sw;
          if (ut && (ut = ut(e, W))) {
            Gg(
              de,
              ut,
              l,
              ce
            );
            break e;
          }
          De && De(e, ee, W), e === "focusout" && W && ee.type === "number" && W.memoizedProps.value != null && wu(ee, "number", ee.value);
        }
        switch (De = W ? fa(W) : window, e) {
          case "focusin":
            (Yg(De) || De.contentEditable === "true") && (Sr = De, Uu = W, xa = null);
            break;
          case "focusout":
            xa = Uu = Sr = null;
            break;
          case "mousedown":
            Lu = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Lu = !1, em(de, l, ce);
            break;
          case "selectionchange":
            if (fw) break;
          case "keydown":
          case "keyup":
            em(de, l, ce);
        }
        var Fe;
        if (ju)
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
          xr ? Vg(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (Lg && l.locale !== "ko" && (xr || it !== "onCompositionStart" ? it === "onCompositionEnd" && xr && (Fe = jg()) : (Jl = ce, Mu = "value" in Jl ? Jl.value : Jl.textContent, xr = !0)), De = zs(W, it), 0 < De.length && (it = new Hg(
          it,
          e,
          null,
          l,
          ce
        ), de.push({ event: it, listeners: De }), Fe ? it.data = Fe : (Fe = Pg(l), Fe !== null && (it.data = Fe)))), (Fe = tw ? nw(e, l) : lw(e, l)) && (it = zs(W, "onBeforeInput"), 0 < it.length && (De = new Hg(
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
  function $w(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function My(e, t, l, r, s) {
    for (var c = t._reactName, h = []; l !== null && l !== r; ) {
      var T = l, V = T.alternate, W = T.stateNode;
      if (T = T.tag, V !== null && V === r) break;
      T !== 5 && T !== 26 && T !== 27 || W === null || (V = W, s ? (W = da(l, c), W != null && h.unshift(
        qa(l, W, V)
      )) : s || (W = da(l, c), W != null && h.push(
        qa(l, W, V)
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
        zg(e, r, c);
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
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = MS.get(l) || l, ji(e, l, r));
    }
  }
  function ud(e, t, l, r, s, c) {
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
        if (!Sg.hasOwnProperty(l))
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
        var T = c = h = s = null, V = null, W = null;
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
                  T = ce;
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
          T,
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
                Et(e, t, s, T, l, null);
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
                Et(e, t, h, T, l, null);
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
        if (Eu(t)) {
          for (ce in l)
            l.hasOwnProperty(ce) && (r = l[ce], r !== void 0 && ud(
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
      l.hasOwnProperty(T) && (r = l[T], r != null && Et(e, t, T, r, l, null));
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
        var s = null, c = null, h = null, T = null, V = null, W = null, ce = null;
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
                T = le;
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
        Su(
          e,
          h,
          T,
          V,
          W,
          ce,
          c,
          s
        );
        return;
      case "select":
        le = h = T = ee = null;
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
                T = c;
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
        t = T, l = h, r = le, ee != null ? hr(e, !!l, ee, !1) : !!r != !!l && (t != null ? hr(e, !!l, t, !0) : hr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        le = ee = null;
        for (T in l)
          if (s = l[T], l.hasOwnProperty(T) && s != null && !r.hasOwnProperty(T))
            switch (T) {
              case "value":
                break;
              case "children":
                break;
              default:
                Et(e, t, T, null, r, s);
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
        if (Eu(t)) {
          for (var Tt in l)
            ee = l[Tt], l.hasOwnProperty(Tt) && ee !== void 0 && !r.hasOwnProperty(Tt) && ud(
              e,
              t,
              Tt,
              void 0,
              r,
              ee
            );
          for (ce in r)
            ee = r[ce], le = l[ce], !r.hasOwnProperty(ce) || ee === le || ee === void 0 && le === void 0 || ud(
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
        var s = l[r], c = s.transferSize, h = s.initiatorType, T = s.duration;
        if (c && T && Ny(h)) {
          for (h = 0, T = s.responseEnd, r += 1; r < l.length; r++) {
            var V = l[r], W = V.startTime;
            if (W > T) break;
            var ce = V.transferSize, de = V.initiatorType;
            ce && Ny(de) && (V = V.responseEnd, h += ce * (V < T ? 1 : (T - W) / (V - W)));
          }
          if (--r, t += 8 * (c + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var fd = null, dd = null;
  function Ns(e) {
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
  function pd(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var gd = null;
  function l1() {
    var e = window.event;
    return e && e.type === "popstate" ? e === gd ? !1 : (gd = e, !0) : (gd = null, !1);
  }
  var ky = typeof setTimeout == "function" ? setTimeout : void 0, o1 = typeof clearTimeout == "function" ? clearTimeout : void 0, _y = typeof Promise == "function" ? Promise : void 0, r1 = typeof queueMicrotask == "function" ? queueMicrotask : typeof _y < "u" ? function(e) {
    return _y.resolve(null).then(e).catch(a1);
  } : ky;
  function a1(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function mo(e) {
    return e === "head";
  }
  function Hy(e, t) {
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
            var h = c.nextSibling, T = c.nodeName;
            c[ua] || T === "SCRIPT" || T === "STYLE" || T === "LINK" && c.rel.toLowerCase() === "stylesheet" || l.removeChild(c), c = h;
          }
        } else
          l === "body" && Xa(e.ownerDocument.body);
      l = s;
    } while (l);
    Kr(t);
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
  function md(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          md(l), bu(l);
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
  function hd(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function yd(e) {
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
  var vd = null;
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
    switch (t = Ns(l), e) {
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
    bu(e);
  }
  var $n = /* @__PURE__ */ new Map(), Py = /* @__PURE__ */ new Set();
  function Ds(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var _l = B.d;
  B.d = {
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
    var e = _l.f(), t = Es();
    return e || t;
  }
  function f1(e) {
    var t = pr(e);
    t !== null && t.tag === 5 && t.type === "form" ? rh(t) : _l.r(e);
  }
  var qr = typeof document > "u" ? null : document;
  function Yy(e, t, l) {
    var r = qr;
    if (r && typeof t == "string" && t) {
      var s = Gn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), Py.has(s) || (Py.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function d1(e) {
    _l.D(e), Yy("dns-prefetch", e, null);
  }
  function p1(e, t) {
    _l.C(e, t), Yy("preconnect", e, t);
  }
  function g1(e, t, l) {
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
      $n.has(c) || (e = x(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), $n.set(c, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Fa(c)) || t === "script" && r.querySelector(Ka(c)) || (t = r.createElement("link"), pn(t, "link", e), on(t), r.head.appendChild(t)));
    }
  }
  function m1(e, t) {
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
      if (!$n.has(c) && (e = x({ rel: "modulepreload", href: e }, t), $n.set(c, e), l.querySelector(s) === null)) {
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
  function h1(e, t, l) {
    _l.S(e, t, l);
    var r = qr;
    if (r && e) {
      var s = gr(r).hoistableStyles, c = Xr(e);
      t = t || "default";
      var h = s.get(c);
      if (!h) {
        var T = { loading: 0, preload: null };
        if (h = r.querySelector(
          Fa(c)
        ))
          T.loading = 5;
        else {
          e = x(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(c)) && bd(e, l);
          var V = h = r.createElement("link");
          on(V), pn(V, "link", e), V._p = new Promise(function(W, ce) {
            V.onload = W, V.onerror = ce;
          }), V.addEventListener("load", function() {
            T.loading |= 1;
          }), V.addEventListener("error", function() {
            T.loading |= 2;
          }), T.loading |= 4, js(h, t, r);
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
  function y1(e, t) {
    _l.X(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Ka(s)), c || (e = x({ src: e, async: !0 }, t), (t = $n.get(s)) && xd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function v1(e, t) {
    _l.M(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), c = r.get(s);
      c || (c = l.querySelector(Ka(s)), c || (e = x({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && xd(e, t), c = l.createElement("script"), on(c), pn(c, "link", e), l.head.appendChild(c)), c = {
        type: "script",
        instance: c,
        count: 1,
        state: null
      }, r.set(s, c));
    }
  }
  function Gy(e, t, l, r) {
    var s = (s = ie.current) ? Ds(s) : null;
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
  function Fr(e) {
    return '[src="' + Gn(e) + '"]';
  }
  function Ka(e) {
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
          ), on(r), pn(r, "style", s), js(r, l.precedence, e), t.instance = r;
        case "stylesheet":
          s = Xr(l.href);
          var c = e.querySelector(
            Fa(s)
          );
          if (c)
            return t.state.loading |= 4, t.instance = c, on(c), c;
          r = qy(l), (s = $n.get(s)) && bd(r, s), c = (e.ownerDocument || e).createElement("link"), on(c);
          var h = c;
          return h._p = new Promise(function(T, V) {
            h.onload = T, h.onerror = V;
          }), pn(c, "link", r), t.state.loading |= 4, js(c, l.precedence, e), t.instance = c;
        case "script":
          return c = Fr(l.src), (s = e.querySelector(
            Ka(c)
          )) ? (t.instance = s, on(s), s) : (r = l, (s = $n.get(c)) && (r = x({}, l), xd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), on(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
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
      var T = r[h];
      if (T.dataset.precedence === t) c = T;
      else if (c !== s) break;
    }
    c ? c.parentNode.insertBefore(e, c.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function bd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function xd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var ks = null;
  function Fy(e, t, l) {
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
        var T = r.get(h);
        T ? T.push(c) : r.set(h, [c]);
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
        var s = Xr(r.href), c = t.querySelector(
          Fa(s)
        );
        if (c) {
          t = c._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = _s.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = c, on(c);
          return;
        }
        c = t.ownerDocument || t, r = qy(r), (s = $n.get(s)) && bd(r, s), c = c.createElement("link"), on(c);
        var h = c;
        h._p = new Promise(function(T, V) {
          h.onload = T, h.onerror = V;
        }), pn(c, "link", r), l.instance = c;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = _s.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var Sd = 0;
  function w1(e, t) {
    return e.stylesheets && e.count === 0 && Us(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && Us(e, e.stylesheets), e.unsuspend) {
          var c = e.unsuspend;
          e.unsuspend = null, c();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Sd === 0 && (Sd = 62500 * n1());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Us(e, e.stylesheets), e.unsuspend)) {
            var c = e.unsuspend;
            e.unsuspend = null, c();
          }
        },
        (e.imgBytes > Sd ? 50 : 800) + t
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
    e.stylesheets = null, e.unsuspend !== null && (e.count++, Hs = /* @__PURE__ */ new Map(), t.forEach(E1, e), Hs = null, _s.call(e));
  }
  function E1(e, t) {
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
    _currentValue: P,
    _currentValue2: P,
    _threadCount: 0
  };
  function T1(e, t, l, r, s, c, h, T, V) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vn(0), this.hiddenUpdates = Vn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = c, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = V, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Zy(e, t, l, r, s, c, h, T, V, W, ce, de) {
    return e = new T1(
      e,
      t,
      l,
      h,
      V,
      W,
      ce,
      de,
      T
    ), t = 1, c === !0 && (t |= 24), c = Dn(3, null, null, t), e.current = c, c.stateNode = e, t = Wu(), t.refCount++, e.pooledCache = t, t.refCount++, c.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, lf(c), e;
  }
  function Jy(e) {
    return e ? (e = Tr, e) : Tr;
  }
  function $y(e, t, l, r, s, c) {
    s = Jy(s), r.context === null ? r.context = s : r.pendingContext = s, r = lo(t), r.payload = { element: l }, c = c === void 0 ? null : c, c !== null && (r.callback = c), l = oo(e, r, t), l !== null && (On(l, e, t), Oa(l, e, t));
  }
  function Wy(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function wd(e, t) {
    Wy(e, t), (e = e.alternate) && Wy(e, t);
  }
  function ev(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Bo(e, 67108864);
      t !== null && On(t, e, 67108864), wd(e, 67108864);
    }
  }
  function tv(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Bo(e, t);
      l !== null && On(l, e, t), wd(e, t);
    }
  }
  var Ls = !0;
  function R1(e, t, l, r) {
    var s = R.T;
    R.T = null;
    var c = B.p;
    try {
      B.p = 2, Ed(e, t, l, r);
    } finally {
      B.p = c, R.T = s;
    }
  }
  function C1(e, t, l, r) {
    var s = R.T;
    R.T = null;
    var c = B.p;
    try {
      B.p = 8, Ed(e, t, l, r);
    } finally {
      B.p = c, R.T = s;
    }
  }
  function Ed(e, t, l, r) {
    if (Ls) {
      var s = Td(r);
      if (s === null)
        cd(
          e,
          t,
          r,
          Is,
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
          var c = pr(s);
          if (c !== null)
            switch (c.tag) {
              case 3:
                if (c = c.stateNode, c.current.memoizedState.isDehydrated) {
                  var h = Ut(c.pendingLanes);
                  if (h !== 0) {
                    var T = c;
                    for (T.pendingLanes |= 2, T.entangledLanes |= 2; h; ) {
                      var V = 1 << 31 - yt(h);
                      T.entanglements[1] |= V, h &= ~V;
                    }
                    cl(c), (gt & 6) === 0 && (Ss = ae() + 500, Ya(0));
                  }
                }
                break;
              case 31:
              case 13:
                T = Bo(c, 2), T !== null && On(T, c, 2), Es(), wd(c, 2);
            }
          if (c = Td(r), c === null && cd(
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
        cd(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function Td(e) {
    return e = Ru(e), Rd(e);
  }
  var Is = null;
  function Rd(e) {
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
  var Cd = !1, ho = null, yo = null, vo = null, Za = /* @__PURE__ */ new Map(), Ja = /* @__PURE__ */ new Map(), bo = [], O1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function lv(e, t) {
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
    }, t !== null && (t = pr(t), t !== null && ev(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function M1(e, t, l, r, s) {
    switch (t) {
      case "focusin":
        return ho = $a(
          ho,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "dragenter":
        return yo = $a(
          yo,
          e,
          t,
          l,
          r,
          s
        ), !0;
      case "mouseover":
        return vo = $a(
          vo,
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
  function ov(e) {
    var t = dr(e.target);
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
          if (t = g(l), t !== null) {
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
  function Bs(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var l = Td(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        Tu = r, l.target.dispatchEvent(r), Tu = null;
      } else
        return t = pr(l), t !== null && ev(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function rv(e, t, l) {
    Bs(e) && l.delete(t);
  }
  function A1() {
    Cd = !1, ho !== null && Bs(ho) && (ho = null), yo !== null && Bs(yo) && (yo = null), vo !== null && Bs(vo) && (vo = null), Za.forEach(rv), Ja.forEach(rv);
  }
  function Vs(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Cd || (Cd = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      A1
    )));
  }
  var Ps = null;
  function av(e) {
    Ps !== e && (Ps = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Ps === e && (Ps = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (Rd(r || l) === null)
              continue;
            break;
          }
          var c = pr(l);
          c !== null && (e.splice(t, 3), t -= 3, Tf(
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
    function t(V) {
      return Vs(V, e);
    }
    ho !== null && Vs(ho, e), yo !== null && Vs(yo, e), vo !== null && Vs(vo, e), Za.forEach(t), Ja.forEach(t);
    for (var l = 0; l < bo.length; l++) {
      var r = bo[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < bo.length && (l = bo[0], l.blockedOn === null); )
      ov(l), l.blockedOn === null && bo.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], c = l[r + 1], h = s[cn] || null;
        if (typeof c == "function")
          h || av(l);
        else if (h) {
          var T = null;
          if (c && c.hasAttribute("formAction")) {
            if (s = c, h = c[cn] || null)
              T = h.formAction;
            else if (Rd(s) !== null) continue;
          } else T = h.action;
          typeof T == "function" ? l[r + 1] = T : (l.splice(r, 3), r -= 3), av(l);
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
  function Od(e) {
    this._internalRoot = e;
  }
  Ys.prototype.render = Od.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    $y(l, r, e, t, null, null);
  }, Ys.prototype.unmount = Od.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      $y(e.current, 2, null, e, null, null), Es(), t[rl] = null;
    }
  };
  function Ys(e) {
    this._internalRoot = e;
  }
  Ys.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Xt();
      e = { blockedOn: null, target: e, priority: t };
      for (var l = 0; l < bo.length && t !== 0 && t < bo[l].priority; l++) ;
      bo.splice(l, 0, e), l === 0 && ov(e);
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
  B.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var z1 = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: R,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Gs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Gs.isDisabled && Gs.supportsFiber)
      try {
        et = Gs.inject(
          z1
        ), ht = Gs;
      } catch {
      }
  }
  return ei.createRoot = function(e, t) {
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
    ), e[rl] = t.current, sd(e), new Od(t);
  }, ei.hydrateRoot = function(e, t, l) {
    if (!u(e)) throw Error(i(299));
    var r = !1, s = "", c = mh, h = hh, T = yh, V = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (c = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (T = l.onRecoverableError), l.formState !== void 0 && (V = l.formState)), t = Zy(
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
      T,
      iv
    ), t.context = Jy(null), l = t.current, r = Un(), r = qe(r), s = lo(r), s.callback = null, oo(l, s, r), l = r, t.current.lanes = l, qt(t, l), cl(t), e[rl] = t.current, sd(e), new Ys(t);
  }, ei.version = "19.2.7", ei;
}
var vv;
function P1() {
  if (vv) return zd.exports;
  vv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), zd.exports = V1(), zd.exports;
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
var kd = {
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
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: u = "", children: f, iconNode: p, ...g }, m) => {
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
        ref: m,
        ...kd,
        width: o ?? d ?? kd.width,
        height: o ?? d ?? kd.height,
        stroke: n ?? S,
        strokeWidth: w,
        className: Nb("lucide", C, u),
        ...!f && !X1(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([A, E]) => y.createElement(A, E)),
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
const $1 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], yi = Qt("check", $1);
const W1 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], mc = Qt("chevron-down", W1);
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
], ui = Qt("x", CE);
function _c() {
  return typeof window < "u";
}
function mn(n) {
  return Rp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function Nt(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Fl(n) {
  var o;
  return (o = (Rp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function Rp(n) {
  return _c() ? n instanceof Node || n instanceof Nt(n).Node : !1;
}
function $e(n) {
  return _c() ? n instanceof Element || n instanceof Nt(n).Element : !1;
}
function Ct(n) {
  return _c() ? n instanceof HTMLElement || n instanceof Nt(n).HTMLElement : !1;
}
function ta(n) {
  return !_c() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof Nt(n).ShadowRoot;
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
function Hc(n) {
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
let _d;
function Cp(n) {
  const o = $e(n) ? In(n) : n;
  return Wo(o.transform) || Wo(o.translate) || Wo(o.scale) || Wo(o.rotate) || Wo(o.perspective) || !Op() && (Wo(o.backdropFilter) || Wo(o.filter)) || ME.test(o.willChange || "") || AE.test(o.contain || "");
}
function zE(n) {
  let o = Yl(n);
  for (; Ct(o) && !Bl(o); ) {
    if (Cp(o))
      return o;
    if (Hc(o))
      return null;
    o = Yl(o);
  }
  return null;
}
function Op() {
  return _d == null && (_d = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), _d;
}
function Bl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function In(n) {
  return Nt(n).getComputedStyle(n);
}
function Uc(n) {
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
    ta(n) && n.host || // Fallback.
    Fl(n)
  );
  return ta(o) ? o.host : o;
}
function _b(n) {
  const o = Yl(n);
  return Bl(o) ? (n.ownerDocument || n).body : Ct(o) && sr(o) ? o : _b(o);
}
function vi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const u = _b(n), f = u === ((i = n.ownerDocument) == null ? void 0 : i.body), p = Nt(u);
  if (f) {
    const g = ap(p);
    return o.concat(p, p.visualViewport || [], sr(u) ? u : [], g && a ? vi(g) : []);
  } else
    return o.concat(u, vi(u, [], a));
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
const Hd = Mp.useInsertionEffect, NE = (
  // React 17 doesn't have useInsertionEffect.
  Hd && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  Hd !== Mp.useLayoutEffect ? Hd : (n) => n()
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
    return hc(o);
  let f = hc(n);
  return o && (f = oi(f, o)), a && (f = oi(f, a)), i && (f = oi(f, i)), u && (f = oi(f, u)), f;
}
function _E(n) {
  if (n.length === 0)
    return Ap;
  if (n.length === 1)
    return hc(n[0]);
  let o = hc(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = oi(o, n[a]);
  return o;
}
function hc(n) {
  return zp(n) ? {
    ...Ub(n, Ap)
  } : HE(n);
}
function oi(n, o) {
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
      yc(f);
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
    return Bb(a) && yc(a), n(...o);
  });
}
function yc(n) {
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
  } = n, p = y.useRef(null), g = Np(!0), m = f ?? g !== void 0, {
    props: d
  } = BE({
    focusableWhenDisabled: a,
    disabled: o,
    composite: m,
    tabIndex: i,
    isNativeButton: u
  }), v = y.useCallback(() => {
    const C = p.current;
    Ud(C) && m && o && d.disabled === void 0 && C.disabled && (C.disabled = !1);
  }, [o, d.disabled, m]);
  xe(v, [v]);
  const x = y.useCallback((C = {}) => {
    const {
      onClick: w,
      onMouseDown: A,
      onKeyUp: E,
      onKeyDown: N,
      onPointerDown: M,
      ...D
    } = C;
    return bn({
      onClick(z) {
        if (o) {
          z.preventDefault();
          return;
        }
        w?.(z);
      },
      onMouseDown(z) {
        o || A?.(z);
      },
      onKeyDown(z) {
        if (o || (yc(z), N?.(z), z.baseUIHandlerPrevented))
          return;
        const I = z.target === z.currentTarget, j = z.currentTarget, H = Ud(j), _ = !u && VE(j), k = I && (u ? H : !_), Y = z.key === "Enter", ne = z.key === " ", X = j.getAttribute("role"), Z = X?.startsWith("menuitem") || X === "option" || X === "gridcell";
        if (I && m && ne) {
          if (z.defaultPrevented && Z)
            return;
          z.preventDefault(), _ || u && H ? (j.click(), z.preventBaseUIHandler()) : k && (w?.(z), z.preventBaseUIHandler());
          return;
        }
        k && (!u && (ne || Y) && z.preventDefault(), !u && Y && w?.(z));
      },
      onKeyUp(z) {
        if (!o) {
          if (yc(z), E?.(z), z.target === z.currentTarget && u && m && Ud(z.currentTarget) && z.key === " ") {
            z.preventDefault();
            return;
          }
          z.baseUIHandlerPrevented || z.target === z.currentTarget && !u && !m && z.key === " " && w?.(z);
        }
      },
      onPointerDown(z) {
        if (o) {
          z.preventDefault();
          return;
        }
        M?.(z);
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
    getButtonProps: x,
    buttonRef: S
  };
}
function Ud(n) {
  return Ct(n) && n.tagName === "BUTTON";
}
function VE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function To(n, o, a, i) {
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
const Gl = Object.freeze([]), xt = Object.freeze({});
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
  } = o, v = d ? FE(a, f) : void 0, x = d ? KE(i, f) : void 0, S = d ? XE(f, m) : xt, C = d && g ? ZE(g) : void 0, w = d ? ip(S, C) ?? {} : xt;
  return typeof document < "u" && (d ? Array.isArray(p) ? w.ref = PE([w.ref, Ev(u), ...p]) : w.ref = To(w.ref, Ev(u), p) : To(null, null)), d ? (v !== void 0 && (w.className = Ib(w.className, v)), x !== void 0 && (w.style = ip(w.style, x)), w) : xt;
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
    buttonRef: x
  } = Mo({
    disabled: f,
    focusableWhenDisabled: p,
    native: g
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
const Tv = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, Rv = qb, aa = (n, o) => (a) => {
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
    return Object.entries(C).every((w) => {
      let [A, E] = w;
      return Array.isArray(E) ? E.includes({
        ...f,
        ...g
      }[A]) : {
        ...f,
        ...g
      }[A] === E;
    }) ? [
      ...d,
      x,
      S
    ] : d;
  }, []);
  return Rv(n, p, m, a?.class, a?.className);
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
}), vc = "-", Cv = [], lT = "arbitrary..", oT = (n) => {
  const o = aT(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return rT(p);
      const g = p.split(vc), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return Fb(g, m, o);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? tT(d, m) : m : d || Cv;
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
    const [g, m] = u[p];
    jp(m, Kb(o, g), a, i);
  }
}, Kb = (n, o) => {
  let a = n;
  const i = o.split(vc), u = i.length;
  for (let f = 0; f < u; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = Xb(), a.nextPart.set(p, g)), a = g;
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
    let p = 0, g = 0, m = 0, d;
    const v = u.length;
    for (let A = 0; A < v; A++) {
      const E = u[A];
      if (p === 0 && g === 0) {
        if (E === Ov) {
          f.push(u.slice(m, A)), m = A + 1;
          continue;
        }
        if (E === "/") {
          d = A;
          continue;
        }
      }
      E === "[" ? p++ : E === "]" ? p-- : E === "(" ? g++ : E === ")" && g--;
    }
    const x = f.length === 0 ? u : u.slice(m);
    let S = x, C = !1;
    x.endsWith(sp) ? (S = x.slice(0, -1), C = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      x.startsWith(sp) && (S = x.slice(1), C = !0)
    );
    const w = d && d > m ? d - m : void 0;
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
    const x = m[v], {
      isExternal: S,
      modifiers: C,
      hasImportantModifier: w,
      baseClassName: A,
      maybePostfixModifierPosition: E
    } = a(x);
    if (S) {
      d = x + (d.length > 0 ? " " + d : d);
      continue;
    }
    let N = !!E, M;
    if (N) {
      const H = A.substring(0, E);
      M = i(H);
      const _ = M && p[M] ? i(A) : void 0;
      _ && _ !== M && (M = _, N = !1);
    } else
      M = i(A);
    if (!M) {
      if (!N) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (M = i(A), !M) {
        d = x + (d.length > 0 ? " " + d : d);
        continue;
      }
      N = !1;
    }
    const D = C.length === 0 ? "" : C.length === 1 ? C[0] : f(C).join(":"), z = w ? D + sp : D, I = z + M;
    if (g.indexOf(I) > -1)
      continue;
    g.push(I);
    const j = u(M, N);
    for (let H = 0; H < j.length; ++H) {
      const _ = j[H];
      g.push(z + _);
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
  const p = (m) => {
    const d = o.reduce((v, x) => x(v), n());
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
}, Zb = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Jb = /^\((?:(\w[\w-]*):)?(.+)\)$/i, TT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, RT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, CT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, OT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, MT = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, AT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, So = (n) => TT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), ul = (n) => !!n && Number.isInteger(Number(n)), Ld = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Hl = (n) => RT.test(n), $b = () => !0, zT = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  CT.test(n) && !OT.test(n)
), kp = () => !1, NT = (n) => MT.test(n), DT = (n) => AT.test(n), jT = (n) => !Me(n) && !Ae(n), kT = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), _T = (n) => Ao(n, t0, kp), Me = (n) => Zb.test(n), er = (n) => Ao(n, n0, zT), Av = (n) => Ao(n, YT, Ze), HT = (n) => Ao(n, o0, $b), UT = (n) => Ao(n, l0, kp), zv = (n) => Ao(n, Wb, kp), LT = (n) => Ao(n, e0, DT), qs = (n) => Ao(n, r0, NT), Ae = (n) => Jb.test(n), ti = (n) => cr(n, n0), IT = (n) => cr(n, l0), Nv = (n) => cr(n, Wb), BT = (n) => cr(n, t0), VT = (n) => cr(n, e0), Xs = (n) => cr(n, r0, !0), PT = (n) => cr(n, o0, !0), Ao = (n, o, a) => {
  const i = Zb.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, cr = (n, o, a = !1) => {
  const i = Jb.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, Wb = (n) => n === "position" || n === "percentage", e0 = (n) => n === "image" || n === "url", t0 = (n) => n === "length" || n === "size" || n === "bg-size", n0 = (n) => n === "length", YT = (n) => n === "number", l0 = (n) => n === "family-name", o0 = (n) => n === "number" || n === "weight", r0 = (n) => n === "shadow", GT = () => {
  const n = nn("color"), o = nn("font"), a = nn("text"), i = nn("font-weight"), u = nn("tracking"), f = nn("leading"), p = nn("breakpoint"), g = nn("container"), m = nn("spacing"), d = nn("radius"), v = nn("shadow"), x = nn("inset-shadow"), S = nn("text-shadow"), C = nn("drop-shadow"), w = nn("blur"), A = nn("perspective"), E = nn("aspect"), N = nn("ease"), M = nn("animate"), D = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], z = () => [
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
  ], I = () => [...z(), Ae, Me], j = () => ["auto", "hidden", "clip", "visible", "scroll"], H = () => ["auto", "contain", "none"], _ = () => [Ae, Me, m], k = () => [So, "full", "auto", ..._()], Y = () => [ul, "none", "subgrid", Ae, Me], ne = () => ["auto", {
    span: ["full", ul, Ae, Me]
  }, ul, Ae, Me], X = () => [ul, "auto", Ae, Me], Z = () => ["auto", "min", "max", "fr", Ae, Me], Q = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], R = () => ["auto", ..._()], B = () => [So, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ..._()], P = () => [So, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ..._()], F = () => [So, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ..._()], L = () => [n, Ae, Me], O = () => [...z(), Nv, zv, {
    position: [Ae, Me]
  }], U = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], te = () => ["auto", "cover", "contain", BT, _T, {
    size: [Ae, Me]
  }], J = () => [Ld, ti, er], re = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, ti, er], oe = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, Ld, Nv, zv], je = () => [
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
      color: [$b],
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
        "grid-cols": Y()
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
        "col-start": X()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": X()
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
        row: ne()
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": X()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": X()
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
        "auto-cols": Z()
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": Z()
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
        justify: [...Q(), "normal"]
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
        content: ["normal", ...Q()]
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
        "place-content": Q()
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
        m: R()
      }],
      /**
       * Margin Inline
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: R()
      }],
      /**
       * Margin Block
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: R()
      }],
      /**
       * Margin Inline Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: R()
      }],
      /**
       * Margin Inline End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: R()
      }],
      /**
       * Margin Block Start
       * @see https://tailwindcss.com/docs/margin
       */
      mbs: [{
        mbs: R()
      }],
      /**
       * Margin Block End
       * @see https://tailwindcss.com/docs/margin
       */
      mbe: [{
        mbe: R()
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: R()
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: R()
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: R()
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: R()
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
        size: B()
      }],
      /**
       * Inline Size
       * @see https://tailwindcss.com/docs/width
       */
      "inline-size": [{
        inline: ["auto", ...P()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-inline-size": [{
        "min-inline": ["auto", ...P()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-inline-size": [{
        "max-inline": ["none", ...P()]
      }],
      /**
       * Block Size
       * @see https://tailwindcss.com/docs/height
       */
      "block-size": [{
        block: ["auto", ...F()]
      }],
      /**
       * Min-Block Size
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-block-size": [{
        "min-block": ["auto", ...F()]
      }],
      /**
       * Max-Block Size
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-block-size": [{
        "max-block": ["none", ...F()]
      }],
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: [g, "screen", ...B()]
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
          ...B()
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
          ...B()
        ]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: ["screen", "lh", ...B()]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": ["screen", "lh", "none", ...B()]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": ["screen", "lh", ...B()]
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
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", Ld, Me]
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
        placeholder: L()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: L()
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
        decoration: L()
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
        bg: L()
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
        from: L()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: L()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: L()
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
        border: L()
      }],
      /**
       * Border Color Inline
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": L()
      }],
      /**
       * Border Color Block
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": L()
      }],
      /**
       * Border Color Inline Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": L()
      }],
      /**
       * Border Color Inline End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": L()
      }],
      /**
       * Border Color Block Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-bs": [{
        "border-bs": L()
      }],
      /**
       * Border Color Block End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-be": [{
        "border-be": L()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": L()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": L()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": L()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": L()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: L()
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
        outline: L()
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
        shadow: L()
      }],
      /**
       * Inset Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
       */
      "inset-shadow": [{
        "inset-shadow": ["none", x, Xs, qs]
      }],
      /**
       * Inset Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
       */
      "inset-shadow-color": [{
        "inset-shadow": L()
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
        ring: L()
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
        "ring-offset": L()
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
        "inset-ring": L()
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
        "text-shadow": L()
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
        "mask-linear-from": L()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": L()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": ge()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": ge()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": L()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": L()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": ge()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": ge()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": L()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": L()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": ge()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": ge()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": L()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": L()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": ge()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": ge()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": L()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": L()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": ge()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": ge()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": L()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": L()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": ge()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": ge()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": L()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": L()
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
        "mask-radial-from": L()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": L()
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
        "mask-radial-at": z()
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
        "mask-conic-from": L()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": L()
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
        "drop-shadow": L()
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
        ease: ["linear", "initial", N, Ae, Me]
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
        accent: L()
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
        caret: L()
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
        "scrollbar-thumb": L()
      }],
      /**
       * Scrollbar Track Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      "scrollbar-track-color": [{
        "scrollbar-track": L()
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
        fill: ["none", ...L()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [Ze, ti, er, Av]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...L()]
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
const XT = aa(
  "tw:group/button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:border tw:border-transparent tw:bg-clip-padding tw:text-[length:var(--fs-body-s)] tw:font-medium tw:whitespace-nowrap tw:transition-[background-color,color,border-color,opacity,transform] tw:duration-[var(--motion-fast)] tw:ease-[var(--ease-out)] tw:outline-none tw:select-none tw:focus-visible:outline tw:focus-visible:outline-[var(--focus-ring-color)] tw:focus-visible:outline-offset-1 tw:active:not-aria-[haspopup]:scale-[0.98] tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:outline tw:aria-invalid:outline-[var(--status-error)] tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
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
} = FT(), Lc = KT.toLowerCase(), bi = QT.toLowerCase(), Ic = /^i(os$|p)/.test(bi) || bi === "macintel" && ZT > 1, Dv = "android", cp = bi === Dv || Lc.includes(Dv), Hp = !Ic && bi.startsWith("mac");
bi.startsWith("win");
const JT = Hp || Ic, zo = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!zo && Lc.includes("firefox");
!zo && Lc.includes("chrom");
const $T = JT, Up = /jsdom|happydom/.test(Lc);
function tt(n) {
  return n?.ownerDocument || document;
}
const WT = [];
function Lp(n) {
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
  return Lp(n.disposeEffect), n;
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
  const o = tt(n), a = o.documentElement, i = o.body, u = Nt(a);
  let f = 0, p = 0, g = !1;
  const m = dl.create();
  if (zo && (u.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const C = u.getComputedStyle(a), w = u.getComputedStyle(i), N = (C.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
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
    const M = a.scrollHeight > a.clientHeight, D = a.scrollWidth > a.clientWidth, z = C.overflowY === "scroll" || w.overflowY === "scroll", I = C.overflowX === "scroll" || w.overflowX === "scroll", j = Math.max(0, u.innerWidth - i.clientWidth), H = Math.max(0, u.innerHeight - i.clientHeight), _ = parseFloat(w.marginTop) + parseFloat(w.marginBottom), k = parseFloat(w.marginLeft) + parseFloat(w.marginRight), Y = sr(a) ? a : i;
    if (g = nR(n), g) {
      a.style.scrollbarGutter = N, Y.style.overflowY = "hidden", Y.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: N,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (M || z) && (a.style.overflowY = "scroll"), (D || I) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: _ || H ? `calc(100dvh - ${_ + H}px)` : "100dvh",
      width: k || j ? `calc(100vw - ${k + j}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, jv), Object.assign(i.style, kv), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = _v);
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
    const f = Ic || !tR(o);
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
function fl(n) {
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
function or(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function sR(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const up = "data-base-ui-focusable", s0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", Bc = "ArrowLeft", Vc = "ArrowRight", c0 = "ArrowUp", Bp = "ArrowDown";
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
function Id(n, o) {
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
function Pc(n) {
  return Ct(n) && n.matches(s0);
}
function uR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${s0}`) != null;
}
function fp(n) {
  return n ? n.getAttribute("role") === "combobox" && Pc(n) : !1;
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
function xc(n) {
  return n ? n.hasAttribute(up) ? n : n.querySelector(`[${up}]`) || n : null;
}
function dR(n, o) {
  return o != null && !or(o) ? 0 : typeof n == "function" ? n() : n;
}
function la(n, o, a) {
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
const No = "none", ql = "trigger-press", Pt = "trigger-hover", Jr = "trigger-focus", Yc = "outside-press", $r = "item-press", f0 = "close-press", Ro = "focus-out", Ti = "escape-key", dp = "list-navigation", d0 = "cancel-open", ri = "sibling-open", gR = "disabled", Gc = "imperative-action", mR = "window-resize";
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
  }, [a, p, u, f]), /* @__PURE__ */ b.jsx(p0.Provider, {
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
  } = o, i = "rootStore" in n ? n.rootStore : n, u = i.useState("floatingId"), f = y.useContext(p0), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: x,
    timeout: S
  } = f, [C, w] = y.useState(!1), A = y.useRef(a), E = y.useRef(!1);
  return xe(() => {
    A.current = a;
  }, [a]), xe(() => () => {
    E.current = !0;
  }, []), xe(() => {
    function N() {
      E.current || w(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, g.current = d.current, S.clear();
    }
    if (p.current && !a && p.current === u) {
      if (w(!1), m) {
        const M = u;
        return S.start(m, () => {
          i.select("open") || p.current && p.current !== M || N();
        }), () => {
          (A.current || p.current !== M) && S.clear();
        };
      }
      N();
    }
  }, [a, u, p, g, m, d, v, S, i]), xe(() => {
    if (!a)
      return;
    const N = v.current, M = p.current;
    S.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: w
    }, p.current = u, g.current = {
      open: 0,
      close: la(d.current, "close")
    }, M !== null && M !== u ? (w(!0), N?.setIsInstantPhase(!0), N?.onOpenChange(!1, Ye(No))) : (w(!1), N?.setIsInstantPhase(!1));
  }, [a, u, i, p, g, d, v, S]), xe(() => () => {
    if (p.current === u) {
      if (v.current = null, !A.current)
        return;
      p.current = null, hR(g, d), S.clear();
    }
  }, [v, p, g, u, d, S]), y.useMemo(() => ({
    hasProvider: x,
    delayRef: g,
    isInstantPhase: C
  }), [x, g, C]);
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
  return /* @__PURE__ */ b.jsx("span", {
    ...o,
    ref: a,
    style: m0,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), SR = ["top", "right", "bottom", "left"], oa = Math.min, Vl = Math.max, Sc = Math.round, Qs = Math.floor, Pl = (n) => ({
  x: n,
  y: n
}), wR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function h0(n, o, a) {
  return Vl(n, oa(o, a));
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
  const i = Do(n), u = Yp(n), f = Pp(u);
  let p = u === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = wc(p)), [p, wc(p)];
}
function TR(n) {
  const o = wc(n);
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
  const u = Do(n);
  let f = OR(Ln(n), a === "start", i);
  return u && (f = f.map((p) => p + "-" + u), o && (f = f.concat(f.map(pp)))), f;
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
function y0(n) {
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
function fi(n, o) {
  return o < 0 || o >= n.length;
}
function uc(n, o) {
  return Il(n.current, {
    disabledIndices: o
  });
}
function gp(n, o) {
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
  while (f >= 0 && f <= n.length - 1 && Ec(n, f, i));
  return f;
}
function Ec(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const u = n[o];
  return u ? qc(u) ? !a && (u.hasAttribute("disabled") || u.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function zR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function qc(n, o = n ? In(n) : null) {
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
  return ta(a) ? a.host : null;
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
  return o ? a.display !== "none" : qc(n, a);
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
function Bd(n) {
  if (mn(n) !== "input")
    return null;
  const o = n;
  return o.type === "radio" && o.name !== "" ? o : null;
}
function _R(n, o) {
  const a = Bd(n);
  if (!a)
    return !0;
  const i = o.find((u) => {
    const f = Bd(u);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : o.find((u) => {
    const f = Bd(u);
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
function Ri(n) {
  const o = T0(n);
  return o.filter((a) => x0(a) >= 0 && _R(a, o));
}
function R0(n, o) {
  const a = Ri(n), i = a.length;
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
  Ri(n).forEach((a) => {
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
function Oo(n, o, a = !0) {
  return n.filter((u) => u.parentId === o).flatMap((u) => [...!a || u.context?.open ? [u] : [], ...Oo(n, u.id, a)]);
}
function Bv(n, o) {
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
const Vd = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Vv = "data-base-ui-inert", hp = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let li = /* @__PURE__ */ new WeakMap(), Pd = 0;
function IR(n) {
  return hp[n];
}
function M0(n) {
  return n ? ta(n) ? n.host : M0(n.parentNode) : null;
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
  let p = null, g = null;
  const m = Pv(o, n), d = u ? Gv(o, Yv(m), new Set(m)) : [], v = [], x = [];
  if (f) {
    const S = Vd[f], C = IR(f);
    g = C, p = S;
    const w = Pv(o, Array.from(o.querySelectorAll("[aria-live]"))), A = m.concat(w);
    Gv(o, Yv(A), new Set(A)).forEach((N) => {
      const M = N.getAttribute(f), D = M !== null && M !== "false", z = (S.get(N) || 0) + 1;
      S.set(N, z), v.push(N), z === 1 && D && C.add(N), D || N.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return u && d.forEach((S) => {
    const C = (li.get(S) || 0) + 1;
    li.set(S, C), x.push(S), C === 1 && S.setAttribute(Vv, "");
  }), Pd += 1, () => {
    p && v.forEach((S) => {
      const w = (p.get(S) || 0) - 1;
      p.set(S, w), w || (!g?.has(S) && f && S.removeAttribute(f), g?.delete(S));
    }), u && x.forEach((S) => {
      const C = (li.get(S) || 0) - 1;
      li.set(S, C), C || S.removeAttribute(Vv);
    }), Pd -= 1, Pd || (Vd.inert = /* @__PURE__ */ new WeakMap(), Vd["aria-hidden"] = /* @__PURE__ */ new WeakMap(), hp.inert = /* @__PURE__ */ new WeakSet(), hp["aria-hidden"] = /* @__PURE__ */ new WeakSet(), li = /* @__PURE__ */ new WeakMap());
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
var gl = zb();
let Xv = 0;
function VR(n, o = "mui") {
  const [a, i] = y.useState(n), u = n || a;
  return y.useEffect(() => {
    a == null && (Xv += 1, i(`${o}-${Xv}`));
  }, [a, o]), u;
}
const Fv = Mp.useId;
function rr(n, o) {
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
}, D0 = /* @__PURE__ */ y.createContext(null), j0 = () => y.useContext(D0), qR = Si("portal");
function k0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = xt,
    elementProps: u
  } = n, f = rr(), g = j0()?.portalNode, [m, d] = y.useState(null), [v, x] = y.useState(null), S = ze((E) => {
    E !== null && x(E);
  }), C = y.useRef(null);
  xe(() => {
    if (a === null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    if (f == null)
      return;
    const E = (a && (Rp(a) ? a : a.current)) ?? g ?? document.body;
    if (E == null) {
      C.current && (C.current = null, x(null), d(null));
      return;
    }
    C.current !== E && (C.current = E, x(null), d(E));
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
const Xc = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = k0({
    container: g,
    ref: a,
    componentProps: o,
    elementProps: d
  }), S = y.useRef(null), C = y.useRef(null), w = y.useRef(null), A = y.useRef(null), [E, N] = y.useState(null), M = y.useRef(!1), D = E?.modal, z = E?.open, I = typeof m == "boolean" ? m : !!E && !E.modal && E.open && !!v;
  y.useEffect(() => {
    if (!v || D)
      return;
    function H(_) {
      v && _.relatedTarget && Wr(_) && (_.type === "focusin" ? M.current && (Iv(v), M.current = !1) : (LR(v), M.current = !0));
    }
    return pl(Je(v, "focusin", H, !0), Je(v, "focusout", H, !0));
  }, [v, D]), xe(() => {
    !v || z !== !0 || !M.current || (Iv(v), M.current = !1);
  }, [z, v]);
  const j = y.useMemo(() => ({
    beforeOutsideRef: S,
    afterOutsideRef: C,
    beforeInsideRef: w,
    afterInsideRef: A,
    portalNode: v,
    setFocusManagerState: N
  }), [v]);
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [x, /* @__PURE__ */ b.jsxs(D0.Provider, {
      value: j,
      children: [I && v && /* @__PURE__ */ b.jsx(Co, {
        "data-type": "outside",
        ref: S,
        onFocus: (H) => {
          if (Wr(H, v))
            w.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            C0(_)?.focus();
          }
        }
      }), I && v && /* @__PURE__ */ b.jsx("span", {
        "aria-owns": v.id,
        style: GR
      }), v && /* @__PURE__ */ gl.createPortal(p, v), I && v && /* @__PURE__ */ b.jsx(Co, {
        "data-type": "outside",
        ref: C,
        onFocus: (H) => {
          if (Wr(H, v))
            A.current?.focus();
          else {
            const _ = E ? E.domReference : null;
            qp(_)?.focus(), E?.closeOnFocusOut && E?.onOpenChange(!1, Ye(Ro, H.nativeEvent));
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
const H0 = /* @__PURE__ */ y.createContext(null), U0 = /* @__PURE__ */ y.createContext(null), Kl = () => y.useContext(H0)?.id || null, jo = (n) => {
  const o = y.useContext(U0);
  return n ?? o;
};
function Kp(n) {
  const o = rr(), a = jo(n), i = Kl();
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
  } = n, i = Kl();
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
function Ul(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function XR(n, o) {
  const a = Nt(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const Kv = 20;
let Eo = [];
function Qp() {
  Eo = Eo.filter((n) => n.deref()?.isConnected);
}
function Qv(n) {
  Qp(), n && mn(n) !== "body" && (Eo.push(new WeakRef(n)), Eo.length > Kv && (Eo = Eo.slice(-Kv)));
}
function Zv() {
  return Qp(), Eo[Eo.length - 1]?.deref();
}
function FR(n) {
  return n ? Gp(n) ? n : Ri(n)[0] || n : null;
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
function Fc(n) {
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
    getInsideElements: w
  } = n, A = "rootStore" in o ? o.rootStore : o, E = A.useState("open"), N = A.useState("domReferenceElement"), M = A.useState("floatingElement"), {
    events: D,
    dataRef: z
  } = A.context, I = ze(() => z.current.floatingContext?.nodeId), j = u === !1, H = fp(N) && j, _ = Yt(u), k = Yt(f), Y = Yt(d), ne = Yt(E), X = jo(C), Z = j0(), Q = y.useRef(!1), q = y.useRef(!1), R = y.useRef(!1), B = y.useRef(null), P = y.useRef(""), F = y.useRef(""), L = y.useRef(null), O = y.useRef(null), U = To(L, S, Z?.beforeInsideRef), te = To(O, Z?.afterInsideRef), J = sn(), re = sn(), ie = na(), oe = Z != null, se = xc(M), ge = ze((fe = se) => fe ? Ri(fe) : []), je = ze(() => w?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !g)
      return;
    function fe(Re) {
      Re.key === "Tab" && Le(se, vn(tt(se))) && ge().length === 0 && !H && fl(Re);
    }
    const ye = tt(se);
    return Je(ye, "keydown", fe);
  }, [i, se, g, H, ge]), y.useEffect(() => {
    if (i || !E)
      return;
    const fe = tt(se);
    function ye() {
      R.current = !1;
    }
    function Re(ke) {
      const we = gn(ke), Ce = je(), he = Le(M, we) || Le(N, we) || Le(Z?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      R.current = !he, F.current = ke.pointerType || "keyboard", we?.closest(`[${z0}]`) && (q.current = !0, re.start(0, () => {
        q.current = !1;
      }));
    }
    function _e() {
      F.current = "keyboard";
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
  }, [i, M, N, se, E, Z, re, je]), y.useEffect(() => {
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
      Gp(he) && (B.current = he);
    }
    function _e(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Te = gn(Ce);
      g && he == null && Te != null && Le(M, Te) && Qv(Te), queueMicrotask(() => {
        const Oe = I(), He = A.context.triggerElements, ae = je(), pe = he?.hasAttribute(Si("focus-guard")) && [L.current, O.current, Z?.beforeInsideRef.current, Z?.afterInsideRef.current, Z?.beforeOutsideRef.current, Z?.afterOutsideRef.current, Ul(x), Ul(v)].includes(he), Ue = !(Le(N, he) || Le(M, he) || Le(he, M) || Le(Z?.portalNode, he) || ae.some((ve) => ve === he || Le(ve, he)) || he != null && He.hasElement(he) || He.hasMatchingElement((ve) => Le(ve, he)) || pe || X && (Oo(X.nodesRef.current, Oe).find((ve) => Le(ve.context?.elements.floating, he) || Le(ve.context?.elements.domReference, he)) || Bv(X.nodesRef.current, Oe).find((ve) => [ve.context?.elements.floating, xc(ve.context?.elements.floating)].includes(he) || ve.context?.elements.domReference === he)));
        if (Se === N && se && Jv(se), p && Se !== N && !qc(Te) && vn(fe) === fe.body) {
          if (Ct(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const ve = ge(), be = B.current, We = (be && ve.includes(be) ? be : null) || ve[ve.length - 1] || se;
          Ct(We) && We.focus();
        }
        if (z.current.insideReactTree) {
          z.current.insideReactTree = !1;
          return;
        }
        (H || !g) && he && Ue && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (H || he !== Zv()) && (Q.current = !0, A.setOpen(!1, Ye(Ro, Ce)));
      });
    }
    function ke() {
      R.current || (z.current.insideReactTree = !0, J.start(0, () => {
        z.current.insideReactTree = !1;
      }));
    }
    const we = Ct(N) ? N : null;
    if (!(!M && !we))
      return pl(we && Je(we, "focusout", _e), we && Je(we, "pointerdown", ye), M && Je(M, "focusin", Re), M && Je(M, "focusout", _e), M && Z && Je(M, "focusout", ke, !0));
  }, [i, N, M, se, g, X, Z, A, m, p, ge, H, I, z, J, re, ie, v, x, je]), y.useEffect(() => {
    if (i || !M || !E)
      return;
    const fe = Array.from(Z?.portalNode?.querySelectorAll(`[${Si("portal")}]`) || []), Re = (X ? Bv(X.nodesRef.current, I()) : []).find((Se) => fp(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[M, ...fe, L.current, O.current, Z?.beforeOutsideRef.current, Z?.afterOutsideRef.current, ...je()], Re, Ul(x), Ul(v), H ? N : null].filter((Se) => Se != null), we = qv(ke, {
      ariaHidden: g || H,
      mark: !1
    }), Ce = [M, ...fe].filter((Se) => Se != null), he = qv(Ce);
    return () => {
      he(), we();
    };
  }, [E, i, N, M, g, Z, H, X, I, v, x, je]), xe(() => {
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
      _e === !0 || _e === null ? he = Ce() : he = Ul(_e), he = he || Ce();
      const Se = Le(se, vn(fe));
      fc(he, {
        preventScroll: he === se,
        shouldFocus() {
          if (!ne.current)
            return !1;
          if (Se)
            return !0;
          const Te = vn(fe);
          return !(Te !== he && Le(se, Te));
        }
      });
    });
  }, [i, E, se, ge, _, Y, ne]), xe(() => {
    if (i || !se)
      return;
    const fe = tt(se), ye = vn(fe), Re = Y.current == null;
    Qv(ye);
    function _e(we) {
      if (we.open || (P.current = XR(we.nativeEvent, F.current)), we.reason === Pt && we.nativeEvent.type === "mouseleave" && (Q.current = !0), we.reason === Yc)
        if (we.nested)
          Q.current = !1;
        else if (Ip(we.nativeEvent) || i0(we.nativeEvent))
          Q.current = !1;
        else {
          let Ce = !1;
          tt(se).createElement("div").focus({
            get preventScroll() {
              return Ce = !0, !1;
            }
          }), Ce ? Q.current = !1 : Q.current = !0;
        }
    }
    D.on("openchange", _e);
    function ke() {
      const we = k.current;
      let Ce = typeof we == "function" ? we(P.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = N?.isConnected ? N : null, Se = ye?.isConnected && mn(ye) !== "body" ? ye : null;
      let Te = Re ? Se || he : he || Se;
      return Te || (Te = Zv() || null), typeof Ce == "boolean" ? Te : Ul(Ce) || Te || null;
    }
    return () => {
      D.off("openchange", _e);
      const we = vn(fe), Ce = je(), he = Le(M, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || X && Oo(X.nodesRef.current, I(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = k.current, Te = ke();
      queueMicrotask(() => {
        const Oe = FR(Te), He = typeof Se != "boolean";
        Se && !Q.current && Ct(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), Q.current = !1;
      });
    };
  }, [i, M, se, k, Y, D, X, N, I, je]), xe(() => {
    if (!zo || E || !M)
      return;
    const fe = vn(tt(M));
    !Ct(fe) || !Pc(fe) || Le(M, fe) && fe.blur();
  }, [E, M]), xe(() => {
    if (!(i || !Z))
      return Z.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: E,
        onOpenChange: A.setOpen,
        domReference: N
      }), () => {
        Z.setFocusManagerState(null);
      };
  }, [i, Z, g, E, A, m, N]), xe(() => {
    if (!(i || !se))
      return Jv(se), () => {
        queueMicrotask(Qp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !H : !0) && (oe || g);
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ b.jsx(Co, {
      "data-type": "inside",
      ref: U,
      onFocus: (fe) => {
        if (g) {
          const ye = ge();
          fc(ye[ye.length - 1]);
        } else Z?.portalNode && (Q.current = !1, Wr(fe, Z.portalNode) ? qp(N)?.focus() : Ul(x ?? Z.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ b.jsx(Co, {
      "data-type": "inside",
      ref: te,
      onFocus: (fe) => {
        g ? fc(ge()[0]) : Z?.portalNode && (m && (Q.current = !0), Wr(fe, Z.portalNode) ? C0(N)?.focus() : Ul(v ?? Z.afterOutsideRef)?.focus());
      }
    })]
  });
}
function Kc(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: u = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = ql
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, x = y.useRef(void 0), S = na(), C = sn(), w = y.useMemo(() => {
    function A(N, M, D, z) {
      const I = Ye(m, M, D);
      N && z === "touch" && g > 0 ? C.start(g, () => {
        d.setOpen(!0, I);
      }) : d.setOpen(N, I);
    }
    function E(N, M, D) {
      const z = v.current.openEvent, I = d.select("domReferenceElement") !== M;
      return N && I || !N || !u ? !0 : z && p ? !D(z.type) : !1;
    }
    return {
      onPointerDown(N) {
        x.current = N.pointerType;
      },
      onMouseDown(N) {
        const M = x.current, D = N.nativeEvent, z = d.select("open");
        if (N.button !== 0 || i === "click" || or(M, !0) && f)
          return;
        const I = E(z, N.currentTarget, (_) => _ === "click" || _ === "mousedown"), j = gn(D);
        if (Pc(j)) {
          A(I, D, j, M);
          return;
        }
        const H = N.currentTarget;
        S.request(() => {
          A(I, D, H, M);
        });
      },
      onClick(N) {
        if (i === "mousedown-only")
          return;
        const M = x.current;
        if (i === "mousedown" && M) {
          x.current = void 0;
          return;
        }
        if (or(M, !0) && f)
          return;
        const D = d.select("open"), z = E(D, N.currentTarget, (I) => I === "click" || I === "mousedown" || I === "keydown" || I === "keyup");
        A(z, N.nativeEvent, N.currentTarget, M);
      },
      onKeyDown() {
        x.current = void 0;
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
function $v(n) {
  return n != null && n.clientX != null;
}
function QR(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, u = "rootStore" in n ? n.rootStore : n, f = u.useState("open"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.context.dataRef, d = y.useRef(!1), v = y.useRef(null), [x, S] = y.useState(), [C, w] = y.useState([]), A = ze((z) => {
    u.set("positionReference", z);
  }), E = ze((z, I, j) => {
    d.current || m.current.openEvent && !$v(m.current.openEvent) || u.set("positionReference", KR(j ?? g, {
      x: z,
      y: I,
      axis: i,
      dataRef: m,
      pointerType: x
    }));
  }), N = ze((z) => {
    f ? v.current || (E(z.clientX, z.clientY, z.currentTarget), w([])) : E(z.clientX, z.clientY, z.currentTarget);
  }), M = or(x) ? p : f;
  y.useEffect(() => {
    if (!a) {
      A(g);
      return;
    }
    if (!M)
      return;
    function z() {
      v.current?.(), v.current = null;
    }
    const I = Nt(p);
    function j(H) {
      const _ = gn(H);
      Le(p, _) ? z() : E(H.clientX, H.clientY);
    }
    return !m.current.openEvent || $v(m.current.openEvent) ? v.current = Je(I, "mousemove", j) : A(g), z;
  }, [M, a, p, m, g, u, E, A, C]), y.useEffect(() => () => {
    u.set("positionReference", null);
  }, [u]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const D = y.useMemo(() => {
    function z(I) {
      S(I.pointerType);
    }
    return {
      onPointerDown: z,
      onPointerEnter: z,
      onMouseMove: N,
      onMouseEnter: N
    };
  }, [N]);
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
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), x = d.useState("floatingElement"), {
    dataRef: S
  } = d.context, C = jo(m), w = ze(typeof u == "function" ? u : () => !1), A = typeof u == "function" ? w : u, E = A !== !1, N = ze(() => f), {
    escapeKey: M,
    outsidePress: D
  } = JR(g), z = y.useRef(!1), I = y.useRef(!1), j = y.useRef(!1), H = y.useRef(!1), _ = y.useRef(""), k = y.useRef(null), Y = sn(), ne = sn(), X = ze(() => {
    ne.clear(), S.current.insideReactTree = !1;
  }), Z = ze((U) => {
    const te = S.current.floatingContext?.nodeId;
    return (C ? Oo(C.nodesRef.current, te) : []).some((re) => re.context?.open && !re.context.dataRef.current[U]);
  }), Q = ze((U) => Id(U, d.select("floatingElement")) || Id(U, d.select("domReferenceElement"))), q = ze((U) => {
    p() && d.setOpen(!1, Ye(ql, U.nativeEvent));
  }), R = ze((U) => {
    if (!v || !a || !i || U.key !== "Escape" || H.current || !M && Z("__escapeKeyBubbles"))
      return;
    const te = iR(U) ? U.nativeEvent : U, J = Ye(Ti, te);
    d.setOpen(!1, J), J.isCanceled || U.preventDefault(), !M && !J.isPropagationAllowed && U.stopPropagation();
  }), B = ze(() => {
    S.current.insideReactTree = !0, ne.start(0, X);
  }), P = ze((U) => {
    if (!v || !a || U.button !== 0)
      return;
    const te = gn(U.nativeEvent);
    Le(d.select("floatingElement"), te) && (z.current || (z.current = !0, I.current = !1));
  }), F = ze((U) => {
    !v || !a || (U.defaultPrevented || U.nativeEvent.defaultPrevented) && z.current && (I.current = !0);
  });
  y.useEffect(() => {
    if (!v || !a)
      return;
    S.current.__escapeKeyBubbles = M, S.current.__outsidePressBubbles = D;
    const U = new el(), te = new el();
    function J() {
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
      j.current = !0, te.start(0, () => {
        j.current = !1;
      });
    }
    function oe() {
      z.current = !1, I.current = !1;
    }
    function se() {
      const ae = _.current, pe = ae === "pen" || !ae ? "mouse" : ae, Ue = N(), ve = typeof Ue == "function" ? Ue() : Ue;
      return typeof ve == "string" ? ve : ve[pe];
    }
    function ge(ae) {
      const pe = se();
      return pe === "intentional" && ae.type !== "click" || pe === "sloppy" && ae.type === "click";
    }
    function je(ae) {
      const pe = S.current.floatingContext?.nodeId, Ue = C && Oo(C.nodesRef.current, pe).some((ve) => Id(ae, ve.context?.elements.floating));
      return Q(ae) || Ue;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !Q(ae) && (te.clear(), j.current = !1), X();
        return;
      }
      if (S.current.insideReactTree) {
        X();
        return;
      }
      const pe = gn(ae), Ue = `[${Si("inert")}]`, ve = $e(pe) ? pe.getRootNode() : null, be = Array.from((ta(ve) ? ve : tt(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((mt) => Le(mt, pe))))
        return;
      let rt = $e(pe) ? pe : null;
      for (; rt && !Bl(rt); ) {
        const mt = Yl(rt);
        if (Bl(mt) || !$e(mt))
          break;
        rt = mt;
      }
      if (!(be.length && $e(pe) && !cR(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      be.every((mt) => !Le(rt, mt)))) {
        if (Ct(pe) && !("touches" in ae)) {
          const mt = Bl(pe), Dt = In(pe), et = /auto|scroll/, ht = mt || et.test(Dt.overflowX), zt = mt || et.test(Dt.overflowY), yt = ht && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, Mn = zt && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, An = Dt.direction === "rtl", Qe = Mn && (An ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), pt = yt && ae.offsetY > pe.clientHeight;
          if (Qe || pt)
            return;
        }
        if (!je(ae)) {
          if (se() === "intentional" && j.current) {
            te.clear(), j.current = !1;
            return;
          }
          typeof A == "function" && !A(ae) || Z("__outsidePressBubbles") || (d.setOpen(!1, Ye(Yc, ae)), X());
        }
      }
    }
    function fe(ae) {
      se() !== "sloppy" || ae.pointerType === "touch" || !d.select("open") || !a || Q(ae) || Ee(ae);
    }
    function ye(ae) {
      if (se() !== "sloppy" || !d.select("open") || !a || Q(ae))
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
      if (!z.current)
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
          typeof A == "function" && !A(ae) || (te.clear(), j.current = !0, X());
        }
      }
    }
    function Ce(ae) {
      if (se() !== "sloppy" || !k.current || Q(ae))
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
      se() !== "sloppy" || !k.current || Q(ae) || (k.current.dismissOnTouchEnd && Ee(ae), Y.clear(), k.current = null);
    }
    function Te(ae) {
      Re(ae, Se);
    }
    const Oe = tt(x), He = pl(i && pl(Je(Oe, "keydown", R), Je(Oe, "compositionstart", J), Je(Oe, "compositionend", re)), E && pl(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", we, !0), Je(Oe, "pointercancel", we, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", we, !0), Je(Oe, "touchstart", _e, !0), Je(Oe, "touchmove", he, !0), Je(Oe, "touchend", Te, !0)));
    return () => {
      He(), U.clear(), te.clear(), oe(), j.current = !1;
    };
  }, [S, x, i, E, A, v, a, M, D, R, X, N, Z, Q, C, d, Y]), y.useEffect(X, [A, X]);
  const L = y.useMemo(() => ({
    onKeyDown: R,
    onPointerDown: q,
    onClick: q
  }), [R, q]), O = y.useMemo(() => ({
    onKeyDown: R,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: F,
    onMouseDown: F,
    onClickCapture: B,
    onMouseDownCapture(U) {
      B(), P(U);
    },
    onPointerDownCapture(U) {
      B(), P(U);
    },
    onMouseUpCapture: B,
    onTouchEndCapture: B,
    onTouchMoveCapture: B
  }), [R, B, P, F]);
  return y.useMemo(() => a ? {
    reference: L,
    floating: O,
    trigger: L
  } : {}, [a, L, O]);
}
function Wv(n, o, a) {
  let {
    reference: i,
    floating: u
  } = n;
  const f = Wn(o), p = Yp(o), g = Pp(p), m = Ln(o), d = f === "y", v = i.x + i.width / 2 - u.width / 2, x = i.y + i.height / 2 - u.height / 2, S = i[g] / 2 - u[g] / 2;
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
  const w = Do(o);
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
    elementContext: x = "floating",
    altBoundary: S = !1,
    padding: C = 0
  } = Xl(o, n), w = y0(C), E = g[S ? x === "floating" ? "reference" : "floating" : x], N = xi(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(E))) == null || a ? E : E.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: m
  })), M = x === "floating" ? {
    x: i,
    y: u,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, D = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), z = await (f.isElement == null ? void 0 : f.isElement(D)) && await (f.getScale == null ? void 0 : f.getScale(D)) || {
    x: 1,
    y: 1
  }, I = xi(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: M,
    offsetParent: D,
    strategy: m
  }) : M);
  return {
    top: (N.top - I.top + w.top) / z.y,
    bottom: (I.bottom - N.bottom + w.bottom) / z.y,
    left: (N.left - I.left + w.left) / z.x,
    right: (I.right - N.right + w.right) / z.x
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
    y: x
  } = Wv(d, i, m), S = i, C = 0;
  const w = {};
  for (let A = 0; A < f.length; A++) {
    const E = f[A];
    if (!E)
      continue;
    const {
      name: N,
      fn: M
    } = E, {
      x: D,
      y: z,
      data: I,
      reset: j
    } = await M({
      x: v,
      y: x,
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
    v = D ?? v, x = z ?? x, w[N] = {
      ...w[N],
      ...I
    }, j && C < WR && (C++, typeof j == "object" && (j.placement && (S = j.placement), j.rects && (d = j.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: u
    }) : j.rects), {
      x: v,
      y: x
    } = Wv(d, S, m)), A = -1);
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
        initialPlacement: g,
        platform: m,
        elements: d
      } = o, {
        mainAxis: v = !0,
        crossAxis: x = !0,
        fallbackPlacements: S,
        fallbackStrategy: C = "bestFit",
        fallbackAxisSideDirection: w = "none",
        flipAlignment: A = !0,
        ...E
      } = Xl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const N = Ln(u), M = Wn(g), D = Ln(g) === g, z = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), I = S || (D || !A ? [wc(g)] : TR(g)), j = w !== "none";
      !S && j && I.push(...MR(g, A, w, z));
      const H = [g, ...I], _ = await m.detectOverflow(o, E), k = [];
      let Y = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && k.push(_[N]), x) {
        const Q = ER(u, p, z);
        k.push(_[Q[0]], _[Q[1]]);
      }
      if (Y = [...Y, {
        placement: u,
        overflows: k
      }], !k.every((Q) => Q <= 0)) {
        var ne, X;
        const Q = (((ne = f.flip) == null ? void 0 : ne.index) || 0) + 1, q = H[Q];
        if (q && (!(x === "alignment" ? M !== Wn(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        Y.every((P) => Wn(P.placement) === M ? P.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Q,
              overflows: Y
            },
            reset: {
              placement: q
            }
          };
        let R = (X = Y.filter((B) => B.overflows[0] <= 0).sort((B, P) => B.overflows[1] - P.overflows[1])[0]) == null ? void 0 : X.placement;
        if (!R)
          switch (C) {
            case "bestFit": {
              var Z;
              const B = (Z = Y.filter((P) => {
                if (j) {
                  const F = Wn(P.placement);
                  return F === M || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  F === "y";
                }
                return !0;
              }).map((P) => [P.placement, P.overflows.filter((F) => F > 0).reduce((F, L) => F + L, 0)]).sort((P, F) => P[1] - F[1])[0]) == null ? void 0 : Z[0];
              B && (R = B);
              break;
            }
            case "initialPlacement":
              R = g;
              break;
          }
        if (u !== R)
          return {
            reset: {
              placement: R
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
      } = Xl(n, o);
      switch (u) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), g = eb(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: tb(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), g = eb(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: tb(g)
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
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(u.floating)), p = Ln(a), g = Do(a), m = Wn(a) === "y", d = B0.has(p) ? -1 : 1, v = f && m ? -1 : 1, x = Xl(o, n);
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
              y: z
            } = M;
            return {
              x: D,
              y: z
            };
          }
        },
        ...d
      } = Xl(n, o), v = {
        x: a,
        y: i
      }, x = await f.detectOverflow(o, d), S = Wn(u), C = Vp(S);
      let w = v[C], A = v[S];
      const E = (M, D) => h0(D + x[M === "y" ? "top" : "left"], D, D - x[M === "y" ? "bottom" : "right"]);
      p && (w = E(C, w)), g && (A = E(S, A));
      const N = m.fn({
        ...o,
        [C]: w,
        [S]: A
      });
      return {
        ...N,
        data: {
          x: N.x - a,
          y: N.y - i,
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
        crossAxis: x = !0
      } = Xl(n, o), S = {
        x: u,
        y: f
      }, C = Wn(p), w = Vp(C);
      let A = S[w], E = S[C];
      const N = Xl(d, o), M = typeof N == "number" ? {
        mainAxis: N,
        crossAxis: 0
      } : {
        mainAxis: (a = N.mainAxis) != null ? a : 0,
        crossAxis: (i = N.crossAxis) != null ? i : 0
      };
      if (v) {
        const I = w === "y" ? "height" : "width", j = g.reference[w] - g.floating[I] + M.mainAxis, H = g.reference[w] + g.reference[I] - M.mainAxis;
        A < j ? A = j : A > H && (A = H);
      }
      if (x) {
        var D, z;
        const I = w === "y" ? "width" : "height", j = B0.has(Ln(p)), H = g.reference[C] - g.floating[I] + (j && ((D = m.offset) == null ? void 0 : D[C]) || 0) + (j ? 0 : M.crossAxis), _ = g.reference[C] + g.reference[I] + (j ? 0 : ((z = m.offset) == null ? void 0 : z[C]) || 0) - (j ? M.crossAxis : 0);
        E < H ? E = H : E > _ && (E = _);
      }
      return {
        [w]: A,
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
        ...g
      } = Xl(n, o), m = await u.detectOverflow(o, g), d = Ln(a), v = Do(a), x = Wn(a) === "y", {
        width: S,
        height: C
      } = i.floating;
      let w, A;
      d === "top" || d === "bottom" ? (w = d, A = v === (await (u.isRTL == null ? void 0 : u.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (A = d, w = v === "end" ? "top" : "bottom");
      const E = C - m.top - m.bottom, N = S - m.left - m.right, M = oa(C - m[w], E), D = oa(S - m[A], N), z = o.middlewareData.shift, I = !z;
      let j = M, H = D;
      z != null && z.enabled.x && (H = N), z != null && z.enabled.y && (j = E), I && !v && (x ? H = S - 2 * Vl(m.left, m.right) : j = C - 2 * Vl(m.top, m.bottom)), await p({
        ...o,
        availableWidth: H,
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
  const u = Ct(n), f = u ? n.offsetWidth : a, p = u ? n.offsetHeight : i, g = Sc(a) !== f || Sc(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function Zp(n) {
  return $e(n) ? n : n.contextElement;
}
function ea(n) {
  const o = Zp(n);
  if (!Ct(o))
    return Pl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: u,
    $: f
  } = V0(o);
  let p = (f ? Sc(a.width) : a.width) / i, g = (f ? Sc(a.height) : a.height) / u;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const sC = /* @__PURE__ */ Pl(0);
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
function ar(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const u = n.getBoundingClientRect(), f = Zp(n);
  let p = Pl(1);
  o && (i ? $e(i) && (p = ea(i)) : p = ea(n));
  const g = cC(f, a, i) ? P0(f) : Pl(0);
  let m = (u.left + g.x) / p.x, d = (u.top + g.y) / p.y, v = u.width / p.x, x = u.height / p.y;
  if (f && i) {
    const S = Nt(f), C = $e(i) ? Nt(i) : i;
    let w = S, A = ap(w);
    for (; A && C !== w; ) {
      const E = ea(A), N = A.getBoundingClientRect(), M = In(A), D = N.left + (A.clientLeft + parseFloat(M.paddingLeft)) * E.x, z = N.top + (A.clientTop + parseFloat(M.paddingTop)) * E.y;
      m *= E.x, d *= E.y, v *= E.x, x *= E.y, m += D, d += z, w = Nt(A), A = ap(w);
    }
  }
  return xi({
    width: v,
    height: x,
    x: m,
    y: d
  });
}
function Qc(n, o) {
  const a = Uc(n).scrollLeft;
  return o ? o.left + a : ar(Fl(n)).left + a;
}
function Y0(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - Qc(n, a), u = a.top + o.scrollTop;
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
  const f = u === "fixed", p = Fl(i), g = o ? Hc(o.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Pl(1);
  const v = Pl(0), x = Ct(i);
  if ((x || !f) && ((mn(i) !== "body" || sr(p)) && (m = Uc(i)), x)) {
    const C = ar(i);
    d = ea(i), v.x = C.x + i.clientLeft, v.y = C.y + i.clientTop;
  }
  const S = p && !x && !f ? Y0(p, m) : Pl(0);
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
  const o = Uc(n), a = n.ownerDocument.body, i = Vl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), u = Vl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + Qc(n);
  const p = -o.scrollTop;
  return In(a).direction === "rtl" && (f += Vl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: u,
    x: f,
    y: p
  };
}
const pC = 25;
function gC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", u = Nt(n), f = Fl(n), p = u.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, v = 0;
  if (p) {
    const S = !Op() || o === "fixed";
    i ? S || (d = -p.offsetLeft, v = -p.offsetTop) : (g = p.width, m = p.height, S && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (Qc(f) <= 0) {
    const S = f.ownerDocument, C = S.body, w = getComputedStyle(C), A = S.compatMode === "CSS1Compat" && parseFloat(w.marginLeft) + parseFloat(w.marginRight) || 0, E = Math.abs(f.clientWidth - C.clientWidth - A), N = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? E / 2 : E;
    N <= pC && (g -= N);
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
function nb(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = gC(n, a, o);
  else if (o === "document")
    i = dC(Fl(n));
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
  return xi(i);
}
function hC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = vi(n, [], !1).filter((g) => $e(g) && mn(g) !== "body"), u = null;
  const f = In(n).position === "fixed";
  let p = f ? Yl(n) : n;
  for (; $e(p) && !Bl(p); ) {
    const g = In(p), m = Cp(p), d = u ? u.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((x) => x !== p) : u = g, p = Yl(p);
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
  const p = [...a === "clippingAncestors" ? Hc(o) ? [] : hC(o, this._c) : [].concat(a), i], g = nb(o, p[0], u);
  let m = g.top, d = g.right, v = g.bottom, x = g.left;
  for (let S = 1; S < p.length; S++) {
    const C = nb(o, p[S], u);
    m = Vl(C.top, m), d = oa(C.right, d), v = oa(C.bottom, v), x = Vl(C.left, x);
  }
  return {
    width: d - x,
    height: v - m,
    x,
    y: m
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
  const i = Ct(o), u = Fl(o), f = a === "fixed", p = ar(n, !0, f, o);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Pl(0);
  if ((i || !f) && ((mn(o) !== "body" || sr(u)) && (g = Uc(o)), i)) {
    const S = ar(o, !0, f, o);
    m.x = S.x + o.clientLeft, m.y = S.y + o.clientTop;
  }
  !i && u && (m.x = Qc(u));
  const d = u && !i && !f ? Y0(u, g) : Pl(0), v = p.left + g.scrollLeft - m.x - d.x, x = p.top + g.scrollTop - m.y - d.y;
  return {
    x: v,
    y: x,
    width: p.width,
    height: p.height
  };
}
function Yd(n) {
  return In(n).position === "static";
}
function lb(n, o) {
  if (!Ct(n) || In(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Fl(n) === a && (a = a.ownerDocument.body), a;
}
function G0(n, o) {
  const a = Nt(n);
  if (Hc(n))
    return a;
  if (!Ct(n)) {
    let u = Yl(n);
    for (; u && !Bl(u); ) {
      if ($e(u) && !Yd(u))
        return u;
      u = Yl(u);
    }
    return a;
  }
  let i = lb(n, o);
  for (; i && OE(i) && Yd(i); )
    i = lb(i, o);
  return i && Bl(i) && Yd(i) && !Cp(i) ? a : i || zE(n) || a;
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
  getDocumentElement: Fl,
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
  const f = Fl(n);
  function p() {
    var v;
    clearTimeout(u), (v = i) == null || v.disconnect(), i = null;
  }
  function g(v, x) {
    v === void 0 && (v = !1), x === void 0 && (x = 1), p();
    const S = n.getBoundingClientRect(), {
      left: C,
      top: w,
      width: A,
      height: E
    } = S;
    if (v || o(), !A || !E)
      return;
    const N = Qs(w), M = Qs(f.clientWidth - (C + A)), D = Qs(f.clientHeight - (w + E)), z = Qs(C), j = {
      rootMargin: -N + "px " + -M + "px " + -D + "px " + -z + "px",
      threshold: Vl(0, oa(1, x)) || 1
    };
    let H = !0;
    function _(k) {
      const Y = k[0].intersectionRatio;
      if (!X0(S, n.getBoundingClientRect()))
        return g();
      if (Y !== x) {
        if (!H)
          return g();
        Y ? g(!1, Y) : u = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      H = !1;
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
  const m = Nt(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function ob(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: u = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = Zp(n), v = u || f ? [...d ? vi(d) : [], ...o ? vi(o) : []] : [];
  v.forEach((N) => {
    u && N.addEventListener("scroll", a), f && N.addEventListener("resize", a);
  });
  const x = d && g ? wC(d, a, f) : null;
  let S = -1, C = null;
  p && (C = new ResizeObserver((N) => {
    let [M] = N;
    M && M.target === d && C && o && (C.unobserve(o), cancelAnimationFrame(S), S = requestAnimationFrame(() => {
      var D;
      (D = C) == null || D.observe(o);
    })), a();
  }), d && !m && C.observe(d), o && C.observe(o));
  let w, A = m ? ar(n) : null;
  m && E();
  function E() {
    const N = ar(n);
    A && !X0(A, N) && a(), A = N, w = requestAnimationFrame(E);
  }
  return a(), () => {
    var N;
    v.forEach((M) => {
      u && M.removeEventListener("scroll", a), f && M.removeEventListener("resize", a);
    }), x?.(), (N = C) == null || N.disconnect(), C = null, m && cancelAnimationFrame(w);
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
}, dc = zC ? y.useLayoutEffect : NC;
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
function F0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function rb(n, o) {
  const a = F0(n);
  return Math.round(o * a) / a;
}
function Gd(n) {
  const o = y.useRef(n);
  return dc(() => {
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
    transform: g = !0,
    whileElementsMounted: m,
    open: d
  } = n, [v, x] = y.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: o,
    middlewareData: {},
    isPositioned: !1
  }), [S, C] = y.useState(i);
  Tc(S, i) || C(i);
  const [w, A] = y.useState(null), [E, N] = y.useState(null), M = y.useCallback((P) => {
    P !== j.current && (j.current = P, A(P));
  }, []), D = y.useCallback((P) => {
    P !== H.current && (H.current = P, N(P));
  }, []), z = f || w, I = p || E, j = y.useRef(null), H = y.useRef(null), _ = y.useRef(v), k = m != null, Y = Gd(m), ne = Gd(u), X = Gd(d), Z = y.useCallback(() => {
    if (!j.current || !H.current)
      return;
    const P = {
      placement: o,
      strategy: a,
      middleware: S
    };
    ne.current && (P.platform = ne.current), AC(j.current, H.current, P).then((F) => {
      const L = {
        ...F,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: X.current !== !1
      };
      Q.current && !Tc(_.current, L) && (_.current = L, gl.flushSync(() => {
        x(L);
      }));
    });
  }, [S, o, a, ne, X]);
  dc(() => {
    d === !1 && _.current.isPositioned && (_.current.isPositioned = !1, x((P) => ({
      ...P,
      isPositioned: !1
    })));
  }, [d]);
  const Q = y.useRef(!1);
  dc(() => (Q.current = !0, () => {
    Q.current = !1;
  }), []), dc(() => {
    if (z && (j.current = z), I && (H.current = I), z && I) {
      if (Y.current)
        return Y.current(z, I, Z);
      Z();
    }
  }, [z, I, Z, Y, k]);
  const q = y.useMemo(() => ({
    reference: j,
    floating: H,
    setReference: M,
    setFloating: D
  }), [M, D]), R = y.useMemo(() => ({
    reference: z,
    floating: I
  }), [z, I]), B = y.useMemo(() => {
    const P = {
      position: a,
      left: 0,
      top: 0
    };
    if (!R.floating)
      return P;
    const F = rb(R.floating, v.x), L = rb(R.floating, v.y);
    return g ? {
      ...P,
      transform: "translate(" + F + "px, " + L + "px)",
      ...F0(R.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: F,
      top: L
    };
  }, [a, g, R.floating, v.x, v.y]);
  return y.useMemo(() => ({
    ...v,
    update: Z,
    refs: q,
    elements: R,
    floatingStyles: B
  }), [v, Z, q, R, B]);
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
var qd = { exports: {} }, Xd = {};
var ab;
function IC() {
  if (ab) return Xd;
  ab = 1;
  var n = Ei();
  function o(x, S) {
    return x === S && (x !== 0 || 1 / x === 1 / S) || x !== x && S !== S;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, u = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(x, S) {
    var C = S(), w = i({ inst: { value: C, getSnapshot: S } }), A = w[0].inst, E = w[1];
    return f(
      function() {
        A.value = C, A.getSnapshot = S, m(A) && E({ inst: A });
      },
      [x, C, S]
    ), u(
      function() {
        return m(A) && E({ inst: A }), x(function() {
          m(A) && E({ inst: A });
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
  return Xd.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Xd;
}
var ib;
function K0() {
  return ib || (ib = 1, qd.exports = IC()), qd.exports;
}
var Q0 = K0(), Fd = { exports: {} }, Kd = {};
var sb;
function BC() {
  if (sb) return Kd;
  sb = 1;
  var n = Ei(), o = K0();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, u = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return Kd.useSyncExternalStoreWithSelector = function(d, v, x, S, C) {
    var w = f(null);
    if (w.current === null) {
      var A = { hasValue: !1, value: null };
      w.current = A;
    } else A = w.current;
    w = g(
      function() {
        function N(j) {
          if (!M) {
            if (M = !0, D = j, j = S(j), C !== void 0 && A.hasValue) {
              var H = A.value;
              if (C(H, j))
                return z = H;
            }
            return z = j;
          }
          if (H = z, i(D, j)) return H;
          var _ = S(j);
          return C !== void 0 && C(H, _) ? (D = j, H) : (D = j, z = _);
        }
        var M = !1, D, z, I = x === void 0 ? null : x;
        return [
          function() {
            return N(v());
          },
          I === null ? void 0 : function() {
            return N(I());
          }
        ];
      },
      [v, x, S, C]
    );
    var E = u(d, w[0], w[1]);
    return p(
      function() {
        A.hasValue = !0, A.value = E;
      },
      [E]
    ), m(E), E;
  }, Kd;
}
var cb;
function VC() {
  return cb || (cb = 1, Fd.exports = BC()), Fd.exports;
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
class Oi extends J0 {
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
class Zc extends Oi {
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
  } = n, g = o.useState("open"), m = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, x = p, S = y.useRef(null);
  i === void 0 && S.current === null && (S.current = new Zc({
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
  return o.useSyncedValue("floatingId", u), xe(() => {
    const w = {
      open: g,
      floatingId: u,
      referenceElement: m,
      floatingElement: d
    };
    $e(m) && (w.domReferenceElement = m), C.state.positionReference === C.state.referenceElement && (w.positionReference = m), C.update(w);
  }, [g, u, m, d, C]), C.context.onOpenChange = x, C.context.nested = f, C;
}
function Jc(n, o = !1, a = !1) {
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
function $p(n, o = !1, a = !0) {
  const i = na();
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
        !f?.aborted && v.length > 0 && v.some((x) => x.pending || x.playState !== "finished") && d();
      });
    }
    if (o) {
      const v = wi.startingStyle;
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
function Ql(n) {
  const {
    enabled: o = !0,
    open: a,
    ref: i,
    onComplete: u
  } = n, f = ze(u), p = $p(i, a, !1);
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
  [up]: ""
};
function W0(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function Wp(n, o, a = !1) {
  const i = rr(), u = Kl() != null, f = y.useRef(null);
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
      const p = a.current, g = i.current, m = o.context.triggerElements.getById(p);
      g && m === g && (o.context.triggerElements.delete(p), f = !0), a.current = null, i.current = null;
    }
    if (u !== null && (a.current = n, i.current = u, o.context.triggerElements.add(n, u), f = !0), f) {
      const p = o.context.triggerElements.size;
      o.select("open") && o.state.triggerCount !== p && o.set("triggerCount", p);
    }
  }, [o, n]);
}
function $c(n, o, a, i = !1) {
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
  const u = a.reason, f = u === Pt, p = o && u === Jr, g = !o && (u === ql || u === Ti), m = eg(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : g ? v.instantType = "dismiss" : f && (v.instantType = void 0), $c(v, o, a.trigger, m()), n.update(v);
  };
  f ? gl.flushSync(d) : d();
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
  const u = a.useState("isMountedByTrigger", n), f = ex(n, a), p = ze((g) => {
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
function Wc(n, o = {}) {
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
        const [v, x] = d.value;
        p.activeTriggerId = v, p.activeTriggerElement = x;
      }
    }
    (p.triggerCount !== void 0 || p.activeTriggerId !== void 0 || p.activeTriggerElement !== void 0) && n.update(p), m && a && queueMicrotask(() => {
      if (n.select("open") && n.select("activeTriggerId") === m && !n.context.triggerElements.getById(m)) {
        const d = Ye(No);
        n.setOpen(!1, d), d.isCanceled || n.update({
          activeTriggerId: null,
          activeTriggerElement: null
        });
      }
    });
  }, [i, n, u, a]);
}
function eu(n, o, a) {
  const {
    mounted: i,
    setMounted: u,
    transitionStatus: f
  } = Jc(n), p = o.useState("preventUnmountingOnClose"), g = n ? !1 : p;
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
function tu(n, o) {
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
  return new Zc({
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
function nu() {
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
  return new Zc({
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
const di = me((n) => n.triggerIdProp ?? n.activeTriggerId), og = me((n) => n.openProp ?? n.open), ub = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function nx(n, o) {
  return o !== void 0 && og(n) && di(n) === o;
}
function nO(n, o) {
  return nx(n, o) ? !0 : o !== void 0 && og(n) && di(n) == null && n.triggerCount === 1;
}
const lu = {
  open: og,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: di,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: ub,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && di(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => nx(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && di(n) === o && n.mounted),
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
  } = n, u = rr(), f = Kl() != null, p = xn(() => new Zc({
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
  } = n, i = lx(n), u = n.rootContext || i, f = u.useState("referenceElement"), p = u.useState("floatingElement"), g = u.useState("domReferenceElement"), m = u.useState("open"), d = u.useState("floatingId"), [v, x] = y.useState(null), [S, C] = y.useState(void 0), [w, A] = y.useState(void 0), E = y.useRef(null), N = jo(a), M = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), D = DC({
    ...n,
    elements: {
      ...M,
      ...v && {
        reference: v
      }
    }
  }), z = $e(S) ? S : null, I = w === void 0 ? u.state.floatingElement : w;
  u.useSyncedValue("referenceElement", S ?? null), u.useSyncedValue("domReferenceElement", S === void 0 ? g : z), u.useSyncedValue("floatingElement", I);
  const j = y.useCallback((X) => {
    const Z = $e(X) ? {
      getBoundingClientRect: () => X.getBoundingClientRect(),
      getClientRects: () => X.getClientRects(),
      contextElement: X
    } : X;
    x(Z), D.refs.setReference(Z);
  }, [D.refs]), H = y.useCallback((X) => {
    ($e(X) || X === null) && (E.current = X, C(X)), ($e(D.refs.reference.current) || D.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    X !== null && !$e(X)) && D.refs.setReference(X);
  }, [D.refs, C]), _ = y.useCallback((X) => {
    A(X), D.refs.setFloating(X);
  }, [D.refs]), k = y.useMemo(() => ({
    ...D.refs,
    setReference: H,
    setFloating: _,
    setPositionReference: j,
    domReference: E
  }), [D.refs, H, _, j]), Y = y.useMemo(() => ({
    ...D.elements,
    domReference: g
  }), [D.elements, g]), ne = y.useMemo(() => ({
    ...D,
    dataRef: u.context.dataRef,
    open: m,
    onOpenChange: u.setOpen,
    events: u.context.events,
    floatingId: d,
    refs: k,
    elements: Y,
    nodeId: o,
    rootStore: u
  }), [D, k, Y, o, u, m, d]);
  return xe(() => {
    g && (E.current = g);
  }, [g]), xe(() => {
    u.context.dataRef.current.floatingContext = ne;
    const X = N?.nodesRef.current.find((Z) => Z.id === o);
    X && (X.context = ne);
  }), y.useMemo(() => ({
    ...D,
    context: ne,
    refs: k,
    elements: Y,
    rootStore: u
  }), [D, k, Y, ne, u]);
}
const Qd = Hp && zo;
function ox(n, o = {}) {
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
    const C = Nt(S);
    function w() {
      const N = u.select("domReferenceElement");
      !u.select("open") && Ct(N) && N === vn(tt(N)) && (g.current = !0);
    }
    function A() {
      d.current = !0;
    }
    function E() {
      d.current = !1;
    }
    return pl(Je(C, "blur", w), Qd && Je(C, "keydown", A, !0), Qd && Je(C, "pointerdown", E, !0));
  }, [u, a]), y.useEffect(() => {
    if (!a)
      return;
    function S(C) {
      if (C.reason === ql || C.reason === Ti) {
        const w = u.select("domReferenceElement");
        $e(w) && (m.current = w, g.current = !0);
      }
    }
    return f.on("openchange", S), () => {
      f.off("openchange", S);
    };
  }, [f, a, u]);
  const x = y.useMemo(() => {
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
          if (Qd && !C.relatedTarget) {
            if (!d.current && !Pc(A))
              return;
          } else if (!fR(A))
            return;
        }
        const E = bc(C.relatedTarget, u.context.triggerElements), {
          nativeEvent: N,
          currentTarget: M
        } = C, D = typeof i == "function" ? i() : i;
        if (u.select("open") && E || D === 0 || D === void 0) {
          u.setOpen(!0, Ye(Jr, N, M));
          return;
        }
        v.start(D, () => {
          g.current || u.setOpen(!0, Ye(Jr, N, M));
        });
      },
      onBlur(C) {
        S();
        const w = C.relatedTarget, A = C.nativeEvent, E = $e(w) && w.hasAttribute(Si("focus-guard")) && w.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const N = u.select("domReferenceElement"), M = vn(tt(N));
          !w && M === N || Le(p.current.floatingContext?.refs.floating.current, M) || Le(N, M) || E || bc(w ?? M, u.context.triggerElements) || u.setOpen(!1, Ye(Jr, A));
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
const Rc = /* @__PURE__ */ new WeakMap();
function Cc(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && Rc.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), Rc.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function rx(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: u
  } = o, f = Rc.get(a);
  f && f !== n && Cc(f), Cc(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = u, Rc.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", u.style.pointerEvents = "auto";
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
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = jo(), x = Kl(), S = ag(f), C = sn(), w = ze(() => u0(d.current.openEvent?.type, S.interactedInside)), A = ze(() => pR(d.current.openEvent?.type)), E = ze(() => {
    Cc(S);
  });
  xe(() => {
    p || (S.pointerType = void 0, S.restTimeoutPending = !1, S.interactedInside = !1, E());
  }, [p, S, E]), y.useEffect(() => E, [E]), xe(() => {
    if (a && p && S.handleCloseOptions?.blockPointerEvents && A() && $e(m) && g) {
      const N = m, M = g, D = tt(g), z = v?.nodesRef.current.find((_) => _.id === x)?.context?.elements.floating;
      z && (z.style.pointerEvents = "");
      const I = S.pointerEventsScopeElement !== M ? S.pointerEventsScopeElement : null, j = z !== M ? z : null, H = S.handleCloseOptions?.getScope?.() ?? I ?? j ?? N.closest("[data-rootownerid]") ?? D.body;
      return rx(S, {
        scopeElement: H,
        referenceElement: N,
        floatingElement: M
      }), () => {
        E();
      };
    }
  }, [a, p, m, g, S, A, v, x, E]), y.useEffect(() => {
    if (!a)
      return;
    function N() {
      return !!(v && x && Oo(v.nodesRef.current, x).length > 0);
    }
    function M(_) {
      const k = la(i, "close", S.pointerType), Y = () => {
        f.setOpen(!1, Ye(Pt, _)), v?.events.emit("floating.closed", _);
      };
      k ? S.openChangeTimeout.start(k, Y) : (S.openChangeTimeout.clear(), Y());
    }
    function D(_) {
      const k = gn(_);
      if (!uR(k)) {
        S.interactedInside = !1;
        return;
      }
      S.interactedInside = k?.closest("[aria-haspopup]") != null;
    }
    function z() {
      S.openChangeTimeout.clear(), C.clear(), v?.events.off("floating.closed", j), E();
    }
    function I(_) {
      if (N() && v) {
        v.events.on("floating.closed", j);
        return;
      }
      if (bc(_.relatedTarget, f.context.triggerElements))
        return;
      const k = d.current.floatingContext?.nodeId ?? u, Y = _.relatedTarget;
      if (!(v && k && $e(Y) && Oo(v.nodesRef.current, k, !1).some((X) => Le(X.context?.elements.floating, Y)))) {
        if (S.handler) {
          S.handler(_);
          return;
        }
        E(), A() && !w() && M(_);
      }
    }
    function j(_) {
      !v || !x || N() || C.start(0, () => {
        v.events.off("floating.closed", j), f.setOpen(!1, Ye(Pt, _)), v.events.emit("floating.closed", _);
      });
    }
    const H = g;
    return pl(H && Je(H, "mouseenter", z), H && Je(H, "mouseleave", I), H && Je(H, "pointerdown", D, !0), () => {
      v?.events.off("floating.closed", j);
    });
  }, [a, g, f, d, i, u, A, w, E, S, v, x, C]);
}
const oO = {
  current: null
};
function ou(n, o = {}) {
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
    getHandleCloseContext: x,
    isClosing: S,
    shouldOpen: C
  } = o, w = "rootStore" in n ? n.rootStore : n, {
    dataRef: A,
    events: E
  } = w.context, N = jo(d), M = ag(w), D = y.useRef(!1), z = Yt(u), I = Yt(i), j = Yt(p), H = Yt(a), _ = Yt(C), k = Yt(S), Y = ze(() => u0(A.current.openEvent?.type, M.interactedInside)), ne = ze(() => _.current?.() !== !1), X = ze((q, R, B) => {
    const P = w.context.triggerElements;
    if (P.hasElement(R))
      return !q || !Le(q, R);
    if (!$e(B))
      return !1;
    const F = B;
    return P.hasMatchingElement((L) => Le(L, F)) && (!q || !Le(q, F));
  }), Z = ze(() => {
    if (!M.handler)
      return;
    tt(w.select("domReferenceElement")).removeEventListener("mousemove", M.handler), M.handler = void 0;
  }), Q = ze(() => {
    Cc(M);
  });
  return v && (M.handleCloseOptions = z.current?.__options), y.useEffect(() => Z, [Z]), y.useEffect(() => {
    if (!a)
      return;
    function q(R) {
      R.open ? D.current = !1 : (D.current = R.reason === Pt, Z(), M.openChangeTimeout.clear(), M.restTimeout.clear(), M.blockMouseMove = !0, M.restTimeoutPending = !1);
    }
    return E.on("openchange", q), () => {
      E.off("openchange", q);
    };
  }, [a, E, M, Z]), y.useEffect(() => {
    if (!a)
      return;
    function q(F, L = !0) {
      const O = la(I.current, "close", M.pointerType);
      O ? M.openChangeTimeout.start(O, () => {
        w.setOpen(!1, Ye(Pt, F)), N?.events.emit("floating.closed", F);
      }) : L && (M.openChangeTimeout.clear(), w.setOpen(!1, Ye(Pt, F)), N?.events.emit("floating.closed", F));
    }
    const R = m.current ?? (v ? w.select("domReferenceElement") : null);
    if (!$e(R))
      return;
    function B(F) {
      if (M.openChangeTimeout.clear(), M.blockMouseMove = !1, f && !or(M.pointerType))
        return;
      const L = Hv(j.current), O = la(I.current, "open", M.pointerType), U = gn(F), te = F.currentTarget ?? null, J = w.select("domReferenceElement");
      let re = te;
      if ($e(U) && !w.context.triggerElements.hasElement(U)) {
        for (const Re of w.context.triggerElements.elements())
          if (Le(Re, U)) {
            re = Re;
            break;
          }
      }
      $e(te) && $e(J) && !w.context.triggerElements.hasElement(te) && Le(te, J) && (re = J);
      const ie = re == null ? !1 : X(J, re, U), oe = w.select("open"), se = k.current?.() ?? w.select("transitionStatus") === "ending", ge = !oe && se && D.current, je = !ie && $e(re) && $e(J) && Le(J, re) && ge, Ee = L > 0 && !O, fe = ie && (oe || ge) || je, ye = !oe || ie;
      if (fe) {
        ne() && w.setOpen(!0, Ye(Pt, F, re));
        return;
      }
      Ee || (O ? M.openChangeTimeout.start(O, () => {
        ye && ne() && w.setOpen(!0, Ye(Pt, F, re));
      }) : ye && ne() && w.setOpen(!0, Ye(Pt, F, re)));
    }
    function P(F) {
      if (Y()) {
        Q();
        return;
      }
      Z();
      const L = w.select("domReferenceElement"), O = tt(L);
      M.restTimeout.clear(), M.restTimeoutPending = !1;
      const U = A.current.floatingContext ?? x?.();
      if (bc(F.relatedTarget, w.context.triggerElements))
        return;
      if (z.current && U) {
        w.select("open") || M.openChangeTimeout.clear();
        const J = m.current;
        M.handler = z.current({
          ...U,
          tree: N,
          x: F.clientX,
          y: F.clientY,
          onClose() {
            Q(), Z(), H.current && !Y() && J === w.select("domReferenceElement") && q(F, !0);
          }
        }), O.addEventListener("mousemove", M.handler), M.handler(F);
        return;
      }
      (M.pointerType !== "touch" || !Le(w.select("floatingElement"), F.relatedTarget)) && q(F);
    }
    return g ? pl(Je(R, "mousemove", B, {
      once: !0
    }), Je(R, "mouseenter", B), Je(R, "mouseleave", P)) : pl(Je(R, "mouseenter", B), Je(R, "mouseleave", P));
  }, [Z, Q, A, I, w, a, z, M, v, X, Y, f, g, j, m, N, H, x, k, ne]), y.useMemo(() => {
    if (!a)
      return;
    function q(R) {
      M.pointerType = R.pointerType;
    }
    return {
      onPointerDown: q,
      onPointerEnter: q,
      onMouseMove(R) {
        const {
          nativeEvent: B
        } = R, P = R.currentTarget, F = w.select("domReferenceElement"), L = w.select("open"), O = X(F, P, R.target);
        if (f && !or(M.pointerType))
          return;
        if (L && O && M.handleCloseOptions?.blockPointerEvents) {
          const J = w.select("floatingElement");
          if (J) {
            const re = M.handleCloseOptions?.getScope?.() ?? P.ownerDocument.body;
            rx(M, {
              scopeElement: re,
              referenceElement: P,
              floatingElement: J
            });
          }
        }
        const U = Hv(j.current);
        if (L && !O || U === 0 || !O && M.restTimeoutPending && R.movementX ** 2 + R.movementY ** 2 < 2)
          return;
        M.restTimeout.clear();
        function te() {
          if (M.restTimeoutPending = !1, Y())
            return;
          const J = w.select("open");
          !M.blockMouseMove && (!J || O) && ne() && w.setOpen(!0, Ye(Pt, B, P));
        }
        M.pointerType === "touch" ? gl.flushSync(() => {
          te();
        }) : O && L ? te() : (M.restTimeoutPending = !0, M.restTimeout.start(U, te));
      }
    };
  }, [a, M, Y, X, f, w, j, ne]);
}
const rO = "Escape";
function ru(n, o, a) {
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
  return ru(o, n === c0 || n === Bp, n === Bc || n === Vc);
}
function Zd(n, o, a) {
  return ru(o, n === Bp, a ? n === Bc : n === Vc) || n === "Enter" || n === " " || n === "";
}
function aO(n, o, a) {
  return ru(o, a ? n === Bc : n === Vc, n === Bp);
}
function iO(n, o, a, i) {
  const u = a ? n === Vc : n === Bc, f = n === c0;
  return o === "both" || o === "horizontal" && i ? n === rO : ru(o, u, f);
}
function ax(n, o) {
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
    openOnArrowKeyDown: w = !0,
    disabledIndices: A = void 0,
    orientation: E = "vertical",
    parentOrientation: N,
    id: M,
    resetOnPointerLeave: D = !0,
    externalTree: z,
    grid: I
  } = o, j = I != null, H = "rootStore" in n ? n.rootStore : n, _ = H.useState("open"), k = H.useState("floatingElement"), Y = H.useState("domReferenceElement"), ne = H.context.dataRef, X = xc(k), Z = fp(Y), Q = Yt(X), q = Kl(), R = jo(z), B = y.useRef(S), P = y.useRef(p ?? -1), F = y.useRef(null), L = y.useRef(!0), O = ze((ae) => {
    u(P.current === -1 ? null : P.current, ae);
  }), U = y.useRef(!!k), te = y.useRef(_), J = y.useRef(!1), re = y.useRef(!1), ie = y.useRef(null), oe = Yt(A), se = Yt(_), ge = Yt(p), je = Yt(D), Ee = na(), fe = na(), ye = ze(() => {
    function ae(be) {
      x ? R?.events.emit("virtualfocus", be) : ie.current = fc(be, {
        sync: J.current,
        preventScroll: !0
      });
    }
    const pe = a.current[P.current], Ue = re.current;
    pe && ae(pe), (J.current ? (be) => be() : (be) => Ee.request(be))(() => {
      const be = a.current[P.current] || pe;
      if (!be)
        return;
      pe || ae(be), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      he && (Ue || !L.current) && be.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  xe(() => {
    ne.current.orientation = E;
  }, [ne, E]), xe(() => {
    f && (_ && k ? (P.current = p ?? -1, B.current && p != null && (re.current = !0, O())) : U.current && (P.current = -1, O()));
  }, [f, _, k, p, O]), xe(() => {
    if (f) {
      if (!_) {
        J.current = !1;
        return;
      }
      if (k)
        if (i == null) {
          if (J.current = !1, ge.current != null)
            return;
          if (U.current && (P.current = -1, ye()), (!te.current || !U.current) && B.current && (F.current != null || B.current === !0 && F.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (ve) => fe.request(ve) : queueMicrotask)(pe), ae += 1) : (P.current = F.current == null || Zd(F.current, E, v) || d ? uc(a) : gp(a), F.current = null, O());
            };
            pe();
          }
        } else fi(a.current, i) || (P.current = i, ye(), re.current = !1);
    }
  }, [f, _, k, i, ge, d, a, E, v, O, ye, fe]), xe(() => {
    if (!f || k || !R || x || !U.current)
      return;
    const ae = R.nodesRef.current, pe = ae.find((be) => be.id === q)?.context?.elements.floating, Ue = vn(tt(Y ?? pe ?? null)), ve = ae.some((be) => be.context && Le(be.context.elements.floating, Ue));
    pe && !ve && L.current && pe.focus({
      preventScroll: !0
    });
  }, [f, k, Y, R, q, x]), xe(() => {
    te.current = _, U.current = !!k;
  }), xe(() => {
    _ || (F.current = null, B.current = S);
  }, [_, S]);
  const Re = i != null, _e = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (P.current !== pe || i !== pe) && (P.current = pe, O(ae));
  }), ke = ze(() => N ?? R?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), we = ze(() => uc(a, oe.current)), Ce = ze((ae) => {
    if (L.current = !1, J.current = !0, ae.which === 229 || !se.current && ae.currentTarget === Q.current)
      return;
    if (d && iO(ae.key, E, v, j)) {
      Js(ae.key, ke()) || fl(ae), H.setOpen(!1, Ye(dp, ae.nativeEvent)), Ct(Y) && (x ? R?.events.emit("virtualfocus", Y) : Y.focus());
      return;
    }
    const pe = P.current, Ue = uc(a, A), ve = gp(a, A);
    if (Z || (ae.key === "Home" && (fl(ae), P.current = Ue, O(ae)), ae.key === "End" && (fl(ae), P.current = ve, O(ae))), I != null) {
      const be = I(ae, P.current, a, E, m, v, A, Ue, ve);
      if (be != null && (P.current = be, O(ae)), E === "both")
        return;
    }
    if (Js(ae.key, E)) {
      if (fl(ae), _ && !x && vn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        P.current = Zd(ae.key, E, v) ? Ue : ve, O(ae);
        return;
      }
      Zd(ae.key, E, v) ? m ? pe >= ve ? g && pe !== a.current.length ? P.current = -1 : (J.current = !1, P.current = Ue) : P.current = Il(a.current, {
        startingIndex: pe,
        disabledIndices: A
      }) : P.current = Math.min(ve, Il(a.current, {
        startingIndex: pe,
        disabledIndices: A
      })) : m ? pe <= Ue ? g && pe !== -1 ? P.current = a.current.length : (J.current = !1, P.current = ve) : P.current = Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: A
      }) : P.current = Math.max(Ue, Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: A
      })), fi(a.current, P.current) && (P.current = -1), O(ae);
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
      if (!se.current || !L.current || pe.pointerType === "touch")
        return;
      J.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!C || a.current.includes(Ue)) && je.current && (ie.current?.(), ie.current = null, P.current = -1, O(pe), !x)) {
        const ve = Q.current, be = vn(tt(ve));
        ve && Le(ve, be) && ve.focus({
          preventScroll: !0
        });
      }
    }
  }), [_e, se, Q, C, a, O, je, x]), Se = y.useMemo(() => x && _ && Re && {
    "aria-activedescendant": `${M}-${i}`
  }, [x, _, Re, M, i]), Te = y.useMemo(() => ({
    "aria-orientation": E === "both" ? void 0 : E,
    ...Z ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && _ && !x) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Le(Q.current, pe))
          return;
        fl(ae), H.setOpen(!1, Ye(Ro, ae.nativeEvent)), Ct(Y) && Y.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      L.current = !0;
    }
  }), [Se, Ce, Q, E, Z, H, _, x, Y]), Oe = y.useMemo(() => {
    function ae(ve) {
      H.setOpen(!0, Ye(dp, ve.nativeEvent, ve.currentTarget));
    }
    function pe(ve) {
      S === "auto" && Ip(ve.nativeEvent) && (B.current = !x);
    }
    function Ue(ve) {
      B.current = S, S === "auto" && i0(ve.nativeEvent) && (B.current = !0);
    }
    return {
      onKeyDown(ve) {
        const be = H.select("open");
        L.current = !1;
        const We = ve.key.startsWith("Arrow"), rt = aO(ve.key, ke(), v), mt = Js(ve.key, E), Dt = (d ? rt : mt) || ve.key === "Enter" || ve.key.trim() === "";
        if (x && be)
          return Ce(ve);
        if (!(!be && !w && We)) {
          if (Dt) {
            const et = Js(ve.key, ke());
            F.current = d && et ? null : ve.key;
          }
          if (d) {
            rt && (fl(ve), be ? (P.current = we(), O(ve)) : ae(ve));
            return;
          }
          mt && (ge.current != null && (P.current = ge.current), fl(ve), !be && w ? ae(ve) : Ce(ve), be && O(ve));
        }
      },
      onFocus(ve) {
        H.select("open") && !x && (P.current = -1, O(ve));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, S, we, d, O, H, w, E, ke, v, ge, x]), He = y.useMemo(() => ({
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
    onTyping: g,
    enabled: m = !0,
    resetMs: d = 750,
    selectedIndex: v = null
  } = o, x = "rootStore" in n ? n.rootStore : n, S = x.useState("open"), C = sn(), w = y.useRef(""), A = y.useRef(v ?? u ?? -1), E = y.useRef(null), N = ze((z) => {
    function I(Q) {
      const q = i?.current[Q];
      return !q || qc(q);
    }
    function j(Q) {
      return I(Q) ? p == null || !Ec(Gl, Q, p) : !1;
    }
    function H(Q, q, R = 0) {
      if (Q.length === 0)
        return -1;
      const B = (R % Q.length + Q.length) % Q.length, P = q.toLowerCase();
      for (let F = 0; F < Q.length; F += 1) {
        const L = (B + F) % Q.length;
        if (!(!Q[L]?.toLowerCase().startsWith(P) || !j(L)))
          return L;
      }
      return -1;
    }
    const _ = a.current;
    if (w.current.length > 0 && z.key === " " && (fl(z), g?.(!0)), w.current.length > 0 && w.current[0] !== " " && H(_, w.current) === -1 && z.key !== " " && g?.(!1), _ == null || // Character key.
    z.key.length !== 1 || // Modifier key.
    z.ctrlKey || z.metaKey || z.altKey)
      return;
    S && z.key !== " " && (fl(z), g?.(!0));
    const k = w.current === "";
    k && (A.current = v ?? u ?? -1), _.every((Q, q) => Q && j(q) ? Q[0]?.toLowerCase() !== Q[1]?.toLowerCase() : !0) && w.current === z.key && (w.current = "", A.current = E.current), w.current += z.key, C.start(d, () => {
      w.current = "", A.current = E.current, g?.(!1);
    });
    const X = ((k ? v ?? u ?? -1 : A.current) ?? 0) + 1, Z = H(_, w.current, X);
    Z !== -1 ? (f?.(Z), E.current = Z) : z.key !== " " && (w.current = "", g?.(!1));
  }), M = ze((z) => {
    const I = z.relatedTarget, j = x.select("domReferenceElement"), H = x.select("floatingElement");
    Le(j, I) || Le(H, I) || (C.clear(), w.current = "", A.current = E.current, g?.(!1));
  });
  xe(() => {
    !S && v !== null || (C.clear(), E.current = null, w.current !== "" && (w.current = ""));
  }, [S, v, C]), xe(() => {
    S && w.current === "" && (A.current = v ?? u ?? -1);
  }, [S, v, u]);
  const D = y.useMemo(() => ({
    onKeyDown: N,
    onBlur: M
  }), [N, M]);
  return y.useMemo(() => m ? {
    reference: D,
    floating: D
  } : {}, [m, D]);
}
const fb = 0.1, sO = fb * fb, Rt = 0.5;
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
function au(n = {}) {
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
    const x = p?.split("-")[0];
    let S = !1, C = null, w = null, A = typeof performance < "u" ? performance.now() : 0;
    function E(M, D) {
      const z = performance.now(), I = z - A;
      if (C === null || w === null || I === 0)
        return C = M, w = D, A = z, !1;
      const j = M - C, H = D - w, _ = j * j + H * H, k = I * I * sO;
      return C = M, w = D, A = z, _ < k;
    }
    function N() {
      a.clear(), m();
    }
    return function(D) {
      a.clear();
      const z = g.domReference, I = g.floating;
      if (!z || !I || x == null || u == null || f == null)
        return;
      const {
        clientX: j,
        clientY: H
      } = D, _ = gn(D), k = D.type === "mouseleave", Y = Le(I, _), ne = Le(z, _);
      if (Y && (S = !0, !k))
        return;
      if (ne && (S = !1, !k)) {
        S = !0;
        return;
      }
      if (k && $e(D.relatedTarget) && Le(I, D.relatedTarget))
        return;
      function X() {
        return !!(v && Oo(v.nodesRef.current, d).length > 0);
      }
      function Z() {
        X() || N();
      }
      if (X())
        return;
      const Q = z.getBoundingClientRect(), q = I.getBoundingClientRect(), R = u > q.right - q.width / 2, B = f > q.bottom - q.height / 2, P = q.width > Q.width, F = q.height > Q.height, L = (P ? Q : q).left, O = (P ? Q : q).right, U = (F ? Q : q).top, te = (F ? Q : q).bottom;
      if (x === "top" && f >= Q.bottom - 1 || x === "bottom" && f <= Q.top + 1 || x === "left" && u >= Q.right - 1 || x === "right" && u <= Q.left + 1) {
        Z();
        return;
      }
      let J = !1;
      switch (x) {
        case "top":
          J = ec(j, H, L, Q.top + 1, O, q.bottom - 1);
          break;
        case "bottom":
          J = ec(j, H, L, q.top + 1, O, Q.bottom - 1);
          break;
        case "left":
          J = ec(j, H, q.right - 1, te, Q.left + 1, U);
          break;
        case "right":
          J = ec(j, H, Q.right - 1, te, q.left + 1, U);
          break;
      }
      if (J)
        return;
      if (S && !cO(j, H, Q)) {
        Z();
        return;
      }
      if (!k && E(j, H)) {
        Z();
        return;
      }
      let re = !1;
      switch (x) {
        case "top": {
          const ie = P ? Rt / 2 : Rt * 4, oe = P || R ? u + ie : u - ie, se = P ? u - ie : R ? u + ie : u - ie, ge = f + Rt + 1, je = R || P ? q.bottom - Rt : q.top, Ee = R ? P ? q.bottom - Rt : q.top : q.bottom - Rt;
          re = Ws(j, H, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = P ? Rt / 2 : Rt * 4, oe = P || R ? u + ie : u - ie, se = P ? u - ie : R ? u + ie : u - ie, ge = f - Rt, je = R || P ? q.top + Rt : q.bottom, Ee = R ? P ? q.top + Rt : q.bottom : q.top + Rt;
          re = Ws(j, H, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "left": {
          const ie = F ? Rt / 2 : Rt * 4, oe = F || B ? f + ie : f - ie, se = F ? f - ie : B ? f + ie : f - ie, ge = u + Rt + 1, je = B || F ? q.right - Rt : q.left, Ee = B ? F ? q.right - Rt : q.left : q.right - Rt;
          re = Ws(j, H, je, q.top, Ee, q.bottom, ge, oe, ge, se);
          break;
        }
        case "right": {
          const ie = F ? Rt / 2 : Rt * 4, oe = F || B ? f + ie : f - ie, se = F ? f - ie : B ? f + ie : f - ie, ge = u - Rt, je = B || F ? q.left + Rt : q.right, Ee = B ? F ? q.left + Rt : q.right : q.left + Rt;
          re = Ws(j, H, ge, oe, ge, se, je, q.top, Ee, q.bottom);
          break;
        }
      }
      re ? S || a.start(40, Z) : Z();
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
  tx(o, i), Wc(o);
  const {
    forceUnmount: u
  } = eu(i, o), f = y.useCallback(() => {
    o.setOpen(!1, Ye(Gc));
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
  const i = n.useState("open"), u = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = y.useState(0), [v, x] = y.useState(0), S = m === 0, C = Ci(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(N) {
      if (!n.context.outsidePressEnabledRef.current || "button" in N && N.button !== 0 || "touches" in N && N.touches.length !== 1)
        return !1;
      const M = gn(N);
      return S && !u ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === M || n.context.backdropRef.current === M || Le(M, p) && !M?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: S
  });
  a0(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (N, M) => {
    d(N), x(M);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), x(0);
  }), y.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(m + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, m, v, o]);
  const w = C.reference ?? xt, A = C.trigger ?? xt, E = C.floating ?? xt;
  return tu(n, {
    activeTriggerProps: w,
    inactiveTriggerProps: A,
    popupProps: E,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: v
  }), null;
}
const sx = /* @__PURE__ */ y.createContext(!1), cx = /* @__PURE__ */ y.createContext(void 0);
function ur(n) {
  const o = y.useContext(cx);
  if (n === !1 && o === void 0)
    throw new Error(At(27));
  return o;
}
const dO = {
  ...lu,
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
class sg extends Oi {
  constructor(o, a, i = !1) {
    const u = new sa(), f = pO(o);
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
    $c(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return Wp(o, (u, f) => new sg(a, u, f), !0).store;
  }
}
function pO(n = {}) {
  return {
    ...nu(),
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
    disablePointerDismissal: g = !1,
    modal: m = !0,
    actionsRef: d,
    handle: v,
    triggerId: x,
    defaultTriggerId: S = null
  } = n, C = o === "drawer", w = o === "alert-dialog", A = w ? !0 : m, E = w || g, N = w ? "alertdialog" : "dialog", M = ur(!0), z = {
    modal: A,
    disablePointerDismissal: E,
    nested: !!M,
    role: N
  }, I = sg.useStore(v?.store, {
    open: u,
    openProp: i,
    activeTriggerId: S,
    triggerIdProp: x,
    ...z
  });
  _p(() => {
    const ne = i === void 0 && I.state.open === !1 && u === !0 ? {
      open: !0,
      activeTriggerId: S
    } : null;
    w ? I.update(ne ? {
      ...z,
      ...ne
    } : z) : ne && I.update(ne);
  }), I.useControlledProp("openProp", i), I.useControlledProp("triggerIdProp", x), I.useSyncedValues(z), I.useContextCallback("onOpenChange", f), I.useContextCallback("onOpenChangeComplete", p);
  const j = I.useState("open"), H = I.useState("mounted"), _ = I.useState("payload");
  uO({
    store: I,
    actionsRef: d
  });
  const k = j || H, Y = y.useMemo(() => ({
    store: I
  }), [I]);
  return /* @__PURE__ */ b.jsx(sx.Provider, {
    value: !1,
    children: /* @__PURE__ */ b.jsxs(cx.Provider, {
      value: Y,
      children: [k && /* @__PURE__ */ b.jsx(fO, {
        store: I,
        parentContext: M?.store.context,
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
}, iu = {
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
}, fx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    forceRender: p = !1,
    ...g
  } = o, {
    store: m
  } = ur(), d = m.useState("open"), v = m.useState("nested"), x = m.useState("mounted"), S = m.useState("transitionStatus");
  return nt("div", o, {
    state: {
      open: d,
      transitionStatus: S
    },
    ref: [m.context.backdropRef, a],
    stateAttributesMapping: xO,
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
}), dx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    getButtonProps: x,
    buttonRef: S
  } = Mo({
    disabled: p,
    native: g
  }), C = {
    disabled: p
  };
  function w(A) {
    v && d.setOpen(!1, Ye(f0, A.nativeEvent));
  }
  return nt("button", o, {
    state: C,
    ref: [a, S],
    props: [{
      onClick: w
    }, m, x]
  });
});
function Bn(n) {
  return rr(n, "base-ui");
}
const px = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
const gx = /* @__PURE__ */ y.createContext(void 0);
function EO() {
  const n = y.useContext(gx);
  if (n === void 0)
    throw new Error(At(26));
  return n;
}
const pi = "ArrowUp", gi = "ArrowDown", Ac = "ArrowLeft", zc = "ArrowRight", su = "Home", cu = "End", mx = /* @__PURE__ */ new Set([Ac, zc]), TO = /* @__PURE__ */ new Set([Ac, zc, su, cu]), hx = /* @__PURE__ */ new Set([pi, gi]), RO = /* @__PURE__ */ new Set([pi, gi, su, cu]), yx = /* @__PURE__ */ new Set([...mx, ...hx]), Mi = /* @__PURE__ */ new Set([...yx, su, cu]), CO = "Shift", OO = "Control", MO = "Alt", AO = "Meta", zO = /* @__PURE__ */ new Set([CO, OO, MO, AO]);
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
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = gb(n, o, "left"), d = tc(n), v = tc(o);
    a === "ltr" && (m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (u = m - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? u = m - v.scrollMarginLeft - d.scrollPaddingLeft : m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (u = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = gb(n, o, "top"), d = tc(n), v = tc(o);
    m - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - v.scrollMarginTop - d.scrollPaddingTop : m + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
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
const DO = {
  ..._o,
  ...ko,
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
    initialFocus: g,
    ...m
  } = o, {
    store: d
  } = ur(), v = d.useState("descriptionElementId"), x = d.useState("disablePointerDismissal"), S = d.useState("floatingRootContext"), C = d.useState("popupProps"), w = d.useState("modal"), A = d.useState("mounted"), E = d.useState("nested"), N = d.useState("nestedOpenDialogCount"), M = d.useState("open"), D = d.useState("openMethod"), z = d.useState("titleElementId"), I = d.useState("transitionStatus"), j = d.useState("role"), H = S.useState("floatingId"), _ = m.id ?? H;
  EO(), Ql({
    open: M,
    ref: d.context.popupRef,
    onComplete() {
      M && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const k = g === void 0 ? W0(d.context.popupRef) : g, Y = N > 0, ne = d.useStateSetter("popupElement"), Z = nt("div", o, {
    state: {
      open: M,
      nested: E,
      transitionStatus: I,
      nestedDialogOpen: Y
    },
    props: [C, {
      id: _,
      "aria-labelledby": z ?? void 0,
      "aria-describedby": v ?? void 0,
      role: j,
      ...ia,
      hidden: !A,
      onKeyDown(Q) {
        Mi.has(Q.key) && Q.stopPropagation();
      },
      style: {
        [SO.nestedDialogs]: N
      }
    }, m],
    ref: [a, d.context.popupRef, ne],
    stateAttributesMapping: DO
  });
  return /* @__PURE__ */ b.jsx(Fc, {
    context: S,
    openInteractionType: D,
    disabled: !A,
    closeOnFocusOut: !x,
    initialFocus: k,
    returnFocus: p,
    modal: w !== !1,
    restoreFocus: "popup",
    children: Z
  });
});
function uu(n) {
  return Dp(19) ? n : n ? "true" : void 0;
}
const fu = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
  } = ur(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ b.jsx(gx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsxs(Xc, {
      ref: a,
      ...u,
      children: [p && g === !0 && /* @__PURE__ */ b.jsx(fu, {
        ref: f.context.internalBackdropRef,
        inert: uu(!m)
      }), o.children]
    })
  }) : null;
}), xx = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    (Ic ? "touch" : ""));
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
  return /* @__PURE__ */ b.jsx(
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
function du(n) {
  const o = y.useContext(Tx);
  if (o === void 0 && !n)
    throw new Error(At(33));
  return o;
}
const Rx = /* @__PURE__ */ y.createContext(void 0);
function ml(n) {
  const o = y.useContext(Rx);
  if (o === void 0 && !n)
    throw new Error(At(36));
  return o;
}
const FO = /* @__PURE__ */ y.createContext(void 0);
function pu(n = !0) {
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
    itemRef: g,
    itemMetadata: m
  } = n, {
    events: d
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), x = pu(!0), S = x !== void 0;
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
      g.current && f.context.allowMouseUpTriggerRef.current && (!S || C.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [o, a, i, d, u, v, f, p, g, x, S, m]);
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
    nativeButton: g,
    itemMetadata: m,
    nodeId: d
  } = n, v = f.useState("disabled"), x = a || v, S = y.useRef(null), {
    getButtonProps: C,
    buttonRef: w
  } = Mo({
    disabled: x,
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
  }), E = y.useCallback((M) => bn(A, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, M, C), [A, C, m]), N = To(S, w);
  return y.useMemo(() => ({
    getItemProps: E,
    itemRef: N
  }), [E, N]);
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
    nextIndexRef: x
  } = ZO(), S = y.useRef(-1), [C, w] = y.useState(f ?? (u === Ax.GuessFromOrder ? () => {
    if (S.current === -1) {
      const N = x.current;
      x.current += 1, S.current = N;
    }
    return S.current;
  } : -1)), A = y.useRef(null), E = y.useCallback((N) => {
    if (A.current = N, C !== -1 && N !== null && (d.current[C] = N, v)) {
      const M = o !== void 0;
      v.current[C] = M ? o : i?.current?.textContent ?? N.textContent;
    }
  }, [C, d, v, o, i]);
  return xe(() => {
    if (f != null)
      return;
    const N = A.current;
    if (N)
      return p(N, a), () => {
        g(N);
      };
  }, [f, p, g, a]), xe(() => {
    if (f == null)
      return m((N) => {
        const M = A.current ? N.get(A.current)?.index : null;
        M != null && w(M);
      });
  }, [f, m, w]), {
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
    defaultChecked: x,
    onCheckedChange: S,
    style: C,
    ...w
  } = o, A = Ai({
    label: p
  }), E = du(!0), N = Bn(f), {
    store: M
  } = ml(), D = M.useState("isActive", A.index), z = M.useState("itemProps"), [I, j] = ra({
    controlled: v,
    default: x ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: H,
    itemRef: _
  } = cg({
    closeOnClick: d,
    disabled: m,
    highlighted: D,
    id: N,
    store: M,
    nativeButton: g,
    nodeId: E?.context.nodeId,
    itemMetadata: Ox
  }), k = y.useMemo(() => ({
    disabled: m,
    highlighted: D,
    checked: I
  }), [m, D, I]);
  function Y(X) {
    const Z = Ye($r, X.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    S?.(!I, Z), !Z.isCanceled && j((Q) => !Q);
  }
  const ne = nt("div", o, {
    state: k,
    stateAttributesMapping: zx,
    props: [z, {
      role: "menuitemcheckbox",
      "aria-checked": I,
      onClick: Y
    }, w, H],
    ref: [_, a, A.ref]
  });
  return /* @__PURE__ */ b.jsx(Cx.Provider, {
    value: k,
    children: ne
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
    setMounted: x
  } = Jc(m.checked);
  Ql({
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
  return nt("span", o, {
    state: S,
    ref: [a, d],
    stateAttributesMapping: zx,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
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
  } = o, [g, m] = y.useState(void 0), d = nt("div", o, {
    ref: a,
    props: {
      role: "group",
      "aria-labelledby": g,
      ...p
    }
  });
  return /* @__PURE__ */ b.jsx(Nx.Provider, {
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
    ...x
  } = o, S = Ai({
    label: p
  }), C = du(!0), w = Bn(f), {
    store: A
  } = ml(), E = A.useState("isActive", S.index), N = A.useState("itemProps"), {
    getItemProps: M,
    itemRef: D
  } = cg({
    closeOnClick: d,
    disabled: m,
    highlighted: E,
    id: w,
    store: A,
    nativeButton: g,
    nodeId: C?.context.nodeId,
    itemMetadata: Ox
  });
  return nt("div", o, {
    state: {
      disabled: m,
      highlighted: E
    },
    props: [N, x, M],
    ref: [D, a, S.ref]
  });
}), lM = /* @__PURE__ */ y.createContext(void 0);
function gu(n) {
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
  } = du(), x = gu() != null, S = m.useState("open"), C = m.useState("transitionStatus"), w = m.useState("popupProps"), A = m.useState("mounted"), E = m.useState("instantType"), N = m.useState("activeTriggerElement"), M = m.useState("parent"), D = m.useState("lastOpenChangeReason"), z = m.useState("rootId"), I = m.useState("floatingRootContext"), j = m.useState("floatingTreeRoot"), H = m.useState("closeDelay"), _ = m.useState("activeTriggerElement"), k = m.useState("hoverEnabled"), Y = m.useState("disabled"), ne = m.useState("openMethod"), X = M.type === "context-menu";
  Ql({
    open: S,
    ref: m.context.popupRef,
    onComplete() {
      S && m.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function B(P) {
      m.setOpen(!1, Ye(P.reason, P.domEvent));
    }
    return j.events.on("close", B), () => {
      j.events.off("close", B);
    };
  }, [j.events, m]), ig(I, {
    enabled: k && !Y && !X && M.type !== "menubar",
    closeDelay: H
  });
  const Z = y.useCallback((B) => {
    m.set("popupElement", B);
  }, [m]), Q = {
    transitionStatus: C,
    side: d,
    align: v,
    open: S,
    nested: M.type === "menu",
    instant: E
  }, q = nt("div", o, {
    state: Q,
    ref: [a, m.context.popupRef, Z],
    stateAttributesMapping: oM,
    props: [w, {
      onKeyDown(B) {
        x && Mi.has(B.key) && B.stopPropagation();
      }
    }, zi(C), g, {
      "data-rootownerid": z
    }]
  });
  let R = M.type === void 0 || X;
  return (N || M.type === "menubar" && D !== Yc) && (R = !0), /* @__PURE__ */ b.jsx(Fc, {
    context: I,
    openInteractionType: ne,
    modal: X,
    disabled: !A,
    returnFocus: p === void 0 ? R : p,
    initialFocus: M.type !== "menu",
    restoreFocus: !0,
    externalTree: M.type !== "menubar" ? j : void 0,
    previousFocusableElement: _,
    nextFocusableElement: M.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: M.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
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
  } = ml();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Dx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(Xc, {
      ref: a,
      ...u
    })
  }) : null;
}), sM = /* @__PURE__ */ y.createContext(void 0);
function mu() {
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
      offsetParent: x = "real"
    } = Xl(n, o) || {};
    if (d == null)
      return {};
    const S = y0(v), C = {
      x: a,
      y: i
    }, w = Yp(u), A = Pp(w), E = await p.getDimensions(d), N = w === "y", M = N ? "top" : "left", D = N ? "bottom" : "right", z = N ? "clientHeight" : "clientWidth", I = f.reference[A] + f.reference[w] - C[w] - f.floating[A], j = C[w] - f.reference[w], H = x === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let _ = g.floating[z] || f.floating[A];
    (!_ || !await p.isElement?.(H)) && (_ = g.floating[z] || f.floating[A]);
    const k = I / 2 - j / 2, Y = _ / 2 - E[A] / 2 - 1, ne = Math.min(S[M], Y), X = Math.min(S[D], Y), Z = ne, Q = _ - E[A] - X, q = _ / 2 - E[A] / 2 + k, R = h0(Z, q, Q), B = !m.arrow && Do(u) != null && q !== R && f.reference[A] / 2 - (q < Z ? ne : X) - E[A] / 2 < 0, P = B ? q < Z ? q - Z : q - Q : 0;
    return {
      [w]: C[w] + P,
      data: {
        [w]: R,
        centerOffset: q - R - P,
        ...B && {
          alignmentOffset: P
        }
      },
      reset: B
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
      placement: g
    } = n, m = Nt(u), d = m.getComputedStyle(u);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: o,
        y: a,
        data: pc
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
      const M = tt(u);
      S = {
        width: M.documentElement.clientWidth,
        height: M.documentElement.clientHeight
      };
    } else await f.isElement?.(x) && (S = await f.getDimensions(x));
    const C = Ln(g);
    let w = o, A = a;
    C === "left" && (w = S.width - (o + i.width)), C === "top" && (A = S.height - (a + i.height));
    const E = C === "left" ? "right" : pc.sideX, N = C === "top" ? "bottom" : pc.sideY;
    return {
      x: w,
      y: A,
      data: {
        sideX: E,
        sideY: N
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
function hu(n) {
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
    floatingRootContext: w,
    mounted: A,
    collisionAvoidance: E,
    shiftCrossAxis: N = !1,
    nodeId: M,
    adaptiveOrigin: D,
    lazyFlip: z = !1,
    externalTree: I
  } = n, [j, H] = y.useState(null);
  !A && j !== null && H(null);
  const _ = E.side || "flip", k = E.align || "flip", Y = E.fallbackAxisSide || "end", ne = typeof o == "function" ? o : void 0, X = ze(ne), Z = ne ? X : o, Q = Yt(o), q = Yt(A), B = mu() === "rtl", P = j || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": B ? "left" : "right",
    "inline-start": B ? "right" : "left"
  }[i], F = f === "center" ? P : `${P}-${f}`;
  let L = m;
  const O = 1, U = i === "bottom" ? O : 0, te = i === "top" ? O : 0, J = i === "right" ? O : 0, re = i === "left" ? O : 0;
  typeof L == "number" ? L = {
    top: L + U,
    right: L + re,
    bottom: L + te,
    left: L + J
  } : L && (L = {
    top: (L.top || 0) + U,
    right: (L.right || 0) + re,
    bottom: (L.bottom || 0) + te,
    left: (L.left || 0) + J
  });
  const ie = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: L
  }, oe = y.useRef(null), se = Yt(u), ge = Yt(p), je = typeof u != "function" ? u : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  S && fe.push(S), fe.push(jC((Qe) => {
    const pt = hb(Qe, i, B), It = typeof se.current == "function" ? se.current(pt) : se.current, Ht = typeof ge.current == "function" ? ge.current(pt) : ge.current;
    return {
      mainAxis: It,
      crossAxis: Ht,
      alignmentAxis: Ht
    };
  }, [je, Ee, B, i]));
  const ye = k === "none" && _ !== "shift", Re = !ye && (d || N || _ === "shift"), _e = _ === "none" ? null : HC({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: L.top + O,
      right: L.right + O,
      bottom: L.bottom + O,
      left: L.left + O
    },
    mainAxis: !N && _ === "flip",
    crossAxis: k === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: Y
  }), ke = ye ? null : kC((Qe) => {
    const pt = tt(Qe.elements.floating).documentElement;
    return {
      ...ie,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: N ? {
        x: 0,
        y: 0,
        width: pt.clientWidth,
        height: pt.clientHeight
      } : void 0,
      mainAxis: k !== "none",
      crossAxis: Re,
      limiter: d || N ? void 0 : _C((It) => {
        if (!oe.current)
          return {};
        const {
          width: Ht,
          height: Ut
        } = oe.current.getBoundingClientRect(), jt = Wn(Ln(It.placement)), Gt = jt === "y" ? Ht : Ut, Sn = jt === "y" ? L.left + L.right : L.top + L.bottom;
        return {
          offset: Gt / 2 + Sn / 2
        };
      })
    };
  }, [ie, d, N, L, k]);
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
      } = Qe, Gt = Ln(Ht), Sn = Wn(Gt), zn = oe.current, Vn = It.arrow?.x || 0, qt = It.arrow?.y || 0, Pn = zn?.clientWidth || 0, hl = zn?.clientHeight || 0, tl = Vn + Pn / 2, yl = qt + hl / 2, qe = Math.abs(It.shift?.y || 0), St = Ut.reference.height / 2, Xt = typeof u == "function" ? u(hb(Qe, i, B)) : u, ln = qe > Xt, en = {
        top: `${tl}px calc(100% + ${Xt}px)`,
        bottom: `${tl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${yl}px`,
        right: `${-Xt}px ${yl}px`
      }[Gt], Ot = `${tl}px ${Ut.reference.y + St - jt}px`;
      return pt.floating.style.setProperty("--transform-origin", Re && Sn === "y" && ln ? Ot : en), {};
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
    open: C ? A : void 0,
    placement: F,
    middleware: fe,
    strategy: a,
    whileElementsMounted: C ? void 0 : (...Qe) => ob(...Qe, we),
    nodeId: M,
    externalTree: I
  }), {
    sideX: be,
    sideY: We
  } = Oe.adaptiveOrigin || pc, rt = Ue ? a : "fixed", mt = y.useMemo(() => {
    const Qe = D ? {
      position: rt,
      [be]: Se,
      [We]: Te
    } : {
      position: rt,
      ...ve
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [D, rt, be, Se, We, Te, ve, Ue]), Dt = y.useRef(null);
  xe(() => {
    if (!A)
      return;
    const Qe = Q.current, pt = typeof Qe == "function" ? Qe() : Qe, Ht = (yb(pt) ? pt.current : pt) || null || null;
    Ht !== Dt.current && (Ce.setPositionReference(Ht), Dt.current = Ht);
  }, [A, Ce, Z, Q]), y.useEffect(() => {
    if (!A)
      return;
    const Qe = Q.current;
    typeof Qe != "function" && yb(Qe) && Qe.current !== Dt.current && (Ce.setPositionReference(Qe.current), Dt.current = Qe.current);
  }, [A, Ce, Z, Q]), y.useEffect(() => {
    if (C && A && he.reference && he.floating)
      return ob(he.reference, he.floating, He, we);
  }, [C, A, he, He, we]);
  const et = Ln(ae), ht = jx(i, et, B), zt = Do(ae) || "center", yt = !!Oe.hide?.referenceHidden;
  xe(() => {
    z && A && Ue && H(et);
  }, [z, A, Ue, et]);
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
  } = n, f = ze(u), p = y.useRef(0), g = xn(gM).current, m = xn(pM).current, [d, v] = y.useState(0), x = y.useRef(d), S = ze((N, M) => {
    m.set(N, M ?? null), x.current += 1, v(x.current);
  }), C = ze((N) => {
    m.delete(N), x.current += 1, v(x.current);
  }), w = y.useMemo(() => {
    const N = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((D) => D.isConnected).sort(mM).forEach((D, z) => {
      const I = m.get(D) ?? {};
      N.set(D, {
        ...I,
        index: z
      });
    }), N;
  }, [m, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || w.size === 0)
      return;
    const N = new MutationObserver((M) => {
      const D = /* @__PURE__ */ new Set(), z = (I) => D.has(I) ? D.delete(I) : D.add(I);
      M.forEach((I) => {
        I.removedNodes.forEach(z), I.addedNodes.forEach(z);
      }), D.size === 0 && (x.current += 1, v(x.current));
    });
    return w.forEach((M, D) => {
      D.parentElement && N.observe(D.parentElement, {
        childList: !0
      });
    }), () => {
      N.disconnect();
    };
  }, [w]), xe(() => {
    x.current === d && (a.current.length !== w.size && (a.current.length = w.size), i && i.current.length !== w.size && (i.current.length = w.size), p.current = w.size), f(w);
  }, [f, w, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const A = ze((N) => (g.add(N), () => {
    g.delete(N);
  }));
  xe(() => {
    g.forEach((N) => N(w));
  }, [g, w]);
  const E = y.useMemo(() => ({
    register: S,
    unregister: C,
    subscribeMapChange: A,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [S, C, A, a, i, p]);
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
function yu(n, o, {
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
function dg(n, o, a, i) {
  const [u, f] = y.useState(!1);
  xe(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = tt(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - hM);
  }, [n, o, a]), a0(n && (!o || u), i);
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
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A = !1,
    collisionAvoidance: E = N0,
    style: N,
    ...M
  } = o, {
    store: D
  } = ml(), z = aM(), I = pu(!0), j = D.useState("parent"), H = D.useState("floatingRootContext"), _ = D.useState("floatingTreeRoot"), k = D.useState("mounted"), Y = D.useState("open"), ne = D.useState("modal"), X = D.useState("openMethod"), Z = D.useState("activeTriggerElement"), Q = D.useState("transitionStatus"), q = D.useState("positionerElement"), R = D.useState("instantType"), B = D.useState("hasViewport"), P = D.useState("lastOpenChangeReason"), F = D.useState("floatingNodeId"), L = D.useState("floatingParentNodeId"), O = H.useState("domReferenceElement"), U = y.useRef(null), te = $p(q, !1, !1);
  let J = i, re = d, ie = v, oe = m, se = E;
  j.type === "context-menu" && (J = i ?? j.context?.anchor, oe = oe ?? "start", !g && oe !== "center" && (ie = o.alignOffset ?? 2, re = o.sideOffset ?? -5));
  let ge = g, je = oe;
  j.type === "menu" ? (ge = ge ?? "inline-end", je = je ?? "start", se = o.collisionAvoidance ?? Xp) : j.type === "menubar" && (ge = ge ?? (j.context.orientation === "vertical" ? "inline-end" : "bottom"), je = je ?? "start");
  const Ee = j.type === "context-menu", fe = hu({
    anchor: J,
    floatingRootContext: H,
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
    nodeId: F,
    keepMounted: z,
    disableAnchorTracking: A,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: _,
    adaptiveOrigin: B ? ug : void 0
  });
  y.useEffect(() => {
    function Se(Te) {
      Te.open && (Te.parentNodeId === F && D.set("hoverEnabled", !1), Te.nodeId !== F && Te.parentNodeId === D.select("floatingParentNodeId") && D.setOpen(!1, Ye(ri)));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [D, _.events, F]), y.useEffect(() => {
    if (D.select("floatingParentNodeId") == null)
      return;
    function Se(Te) {
      if (Te.open || Te.nodeId !== D.select("floatingParentNodeId"))
        return;
      const Oe = Te.reason ?? ri;
      D.setOpen(!1, Ye(Oe));
    }
    return _.events.on("menuopenchange", Se), () => {
      _.events.off("menuopenchange", Se);
    };
  }, [_.events, D]);
  const ye = sn();
  y.useEffect(() => {
    Y || ye.clear();
  }, [Y, ye]), y.useEffect(() => {
    function Se(Te) {
      if (!(!Y || Te.nodeId !== D.select("floatingParentNodeId")))
        if (Te.target && Z && Z !== Te.target) {
          const Oe = D.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            D.setOpen(!1, Ye(ri));
          }) : D.setOpen(!1, Ye(ri));
        } else
          ye.clear();
    }
    return _.events.on("itemhover", Se), () => {
      _.events.off("itemhover", Se);
    };
  }, [_.events, Y, Z, D, ye]), y.useEffect(() => {
    const Se = {
      open: Y,
      nodeId: F,
      parentNodeId: L,
      reason: D.select("lastOpenChangeReason")
    };
    _.events.emit("menuopenchange", Se);
  }, [_.events, Y, D, F, L]), xe(() => {
    const Se = O, Te = U.current;
    if (Se && (U.current = Se), Te && Se && Se !== Te) {
      D.set("instantType", void 0);
      const Oe = new AbortController();
      return te(() => {
        D.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [O, te, D]);
  const Re = {
    open: Y,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: j.type === "menu",
    instant: R
  }, _e = j.type === "menubar" && j.context.modal;
  dg(Y && (_e || ne && P !== Pt), X === "touch", q, Z);
  const we = yu(o, Re, {
    styles: fe.positionerStyles,
    transitionStatus: Q,
    props: M,
    refs: [a, D.useStateSetter("positionerElement")],
    hidden: !k,
    inert: !Y
  }), Ce = k && j.type !== "menu" && (j.type !== "menubar" && ne && P !== Pt || j.type === "menubar" && j.context.modal);
  let he = null;
  return j.type === "menubar" ? he = j.context.contentElement : j.type === void 0 && (he = Z), /* @__PURE__ */ b.jsxs(Tx.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ b.jsx(fu, {
      ref: j.type === "context-menu" || j.type === "nested-context-menu" ? j.context.internalBackdropRef : null,
      inert: uu(!Y),
      cutout: he
    }), /* @__PURE__ */ b.jsx(L0, {
      id: F,
      children: /* @__PURE__ */ b.jsx(fg, {
        elementsRef: D.context.itemDomElements,
        labelsRef: D.context.itemLabels,
        children: we
      })
    })]
  });
}), vM = /* @__PURE__ */ y.createContext(null);
function kx(n) {
  return y.useContext(vM);
}
const bM = {
  ...lu,
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
class pg extends Oi {
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
    const i = xn(() => new pg(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function xM() {
  return {
    ...nu(),
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
    disabled: g = !1,
    modal: m,
    loopFocus: d = !0,
    orientation: v = "vertical",
    actionsRef: x,
    closeParentOnEsc: S = !1,
    handle: C,
    triggerId: w,
    defaultTriggerId: A = null,
    highlightItemOnHover: E = !0
  } = o, N = pu(!0), M = ml(!0), D = kx(!0), z = Hx(), I = y.useMemo(() => z && M ? {
    type: "menu",
    store: M.store
  } : D ? {
    type: "menubar",
    context: D
  } : N && !M ? {
    type: "context-menu",
    context: N
  } : {
    type: void 0
  }, [N, M, D, z]), j = pg.useStore(C?.store, {
    open: p,
    openProp: i,
    activeTriggerId: A,
    triggerIdProp: w,
    parent: I
  });
  tg(j, i, p, A), j.useControlledProp("openProp", i), j.useControlledProp("triggerIdProp", w), j.useContextCallback("onOpenChangeComplete", f);
  const H = rr(), _ = rr(), k = j.useState("floatingTreeRoot"), Y = Kp(k), ne = Kl(), X = j.useState("open"), Z = j.useState("activeTriggerElement"), Q = j.useState("positionerElement"), q = j.useState("hoverEnabled"), R = j.useState("disabled"), B = j.useState("lastOpenChangeReason"), P = j.useState("parent"), F = j.useState("activeIndex"), L = j.useState("payload"), O = j.useState("floatingParentNodeId"), U = y.useRef(null), te = y.useRef(P.type !== "context-menu"), J = sn(), re = y.useRef(!0), ie = sn(), oe = O != null, {
    openMethod: se,
    triggerProps: ge
  } = Ex(X);
  j.useSyncedValues({
    disabled: g,
    highlightItemOnHover: E,
    modal: P.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: H
  }), Wc(j);
  const {
    forceUnmount: je
  } = eu(X, j, () => {
    j.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    N && !M ? j.update({
      parent: {
        type: "context-menu",
        context: N
      },
      floatingNodeId: Y,
      floatingParentNodeId: ne
    }) : M && j.update({
      floatingNodeId: Y,
      floatingParentNodeId: ne
    });
  }, [N, M, Y, ne, j]), y.useEffect(() => {
    if (X || (U.current = null), P.type === "context-menu") {
      if (!X) {
        J.clear(), te.current = !1;
        return;
      }
      J.start(500, () => {
        te.current = !0;
      });
    }
  }, [J, X, P.type]), xe(() => {
    !X && !q && j.set("hoverEnabled", !0);
  }, [X, q, j]);
  const Ee = ze((be, We) => {
    const rt = We.reason;
    if (X === be && We.trigger === Z && B === rt)
      return;
    const mt = eg(We);
    if (!be && We.trigger == null && (We.trigger = Z ?? void 0), u?.(be, We), We.isCanceled)
      return;
    j.state.floatingRootContext.dispatchOpenChange(be, We);
    const Dt = We.event;
    if (be === !1 && Dt?.type === "click" && Dt.pointerType === "touch" && !re.current)
      return;
    be && rt === Jr ? (re.current = !1, ie.start(300, () => {
      re.current = !0;
    })) : (re.current = !0, ie.clear());
    const et = (rt === ql || rt === $r) && Dt.detail === 0 && Dt?.isTrusted, ht = !be && (rt === Ti || rt == null), zt = {
      open: be,
      openChangeReason: rt
    };
    U.current = We.event ?? null, $c(zt, be, We.trigger, mt()), j.update(zt), P.type === "menubar" && (rt === Jr || rt === Ro || rt === Pt || rt === dp || rt === ri) ? j.set("instantType", "group") : et || ht ? j.set("instantType", et ? "click" : "dismiss") : j.set("instantType", void 0);
  }), fe = $0({
    popupStore: j,
    floatingId: _,
    nested: ne != null,
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
    j.setOpen(!1, Ye(Gc));
  }, [j]);
  y.useImperativeHandle(x, () => ({
    unmount: je,
    close: Re
  }), [je, Re]);
  let _e;
  P.type === "context-menu" && (_e = P.context), y.useImperativeHandle(_e?.positionerRef, () => Q, [Q]), y.useImperativeHandle(_e?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Ci(fe, {
    enabled: !R,
    bubbles: {
      escapeKey: S && P.type === "menu"
    },
    outsidePress() {
      return P.type !== "context-menu" || U.current?.type === "contextmenu" ? !0 : te.current;
    },
    externalTree: oe ? k : void 0
  }), we = mu(), Ce = y.useCallback((be) => {
    j.select("activeIndex") !== be && j.set("activeIndex", be);
  }, [j]), he = ax(fe, {
    enabled: !R,
    listRef: j.context.itemDomElements,
    activeIndex: F,
    nested: P.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: P.type === "menubar" ? P.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: Gl,
    onNavigate: Ce,
    openOnArrowKeyDown: P.type !== "context-menu",
    externalTree: oe ? k : void 0,
    focusItemOnHover: E
  }), Se = y.useCallback((be) => {
    j.context.typingRef.current = be;
  }, [j]), Te = ix(fe, {
    enabled: !R,
    listRef: j.context.itemLabels,
    elementsRef: j.context.itemDomElements,
    activeIndex: F,
    resetMs: PR,
    onMatch: (be) => {
      X && be !== F && j.set("activeIndex", be);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const be = bn(Te.reference, he.reference, ke.reference, {
      onMouseMove() {
        j.set("allowMouseEnter", !0);
      }
    }, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = X, be;
  }, [j, Te.reference, he.reference, ke.reference, ge, X]), He = y.useMemo(() => {
    const be = bn(he.trigger, ke.trigger, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = !1, be;
  }, [he.trigger, ke.trigger, ge]), ae = y.useMemo(() => bn(ia, {
    id: _,
    role: "menu",
    "aria-labelledby": Z?.id,
    onMouseMove() {
      j.set("allowMouseEnter", !0), P.type === "menu" && j.set("hoverEnabled", !1);
    },
    onClick() {
      j.select("hoverEnabled") && j.set("hoverEnabled", !1);
    },
    onKeyDown(be) {
      const We = j.select("keyboardEventRelay");
      We && !be.isPropagationStopped() && We(be);
    }
  }, Te.floating, he.floating, ke.floating), [Z, _, P.type, j, Te.floating, he.floating, ke.floating]), pe = he.item ?? xt;
  tu(j, {
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
      payload: L
    }) : a
  });
  return P.type === void 0 || P.type === "context-menu" ? /* @__PURE__ */ b.jsx(I0, {
    externalTree: k,
    children: ve
  }) : ve;
});
function SM(n) {
  const o = ml().store, a = y.useMemo(() => ({
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
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(u.width) || 0, d = parseFloat(u.height) || 0, v = Math.max(o.width, p, m), x = Math.max(o.height, g, d), S = v - o.width, C = x - o.height;
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
        const x = v.hasAttribute("disabled") || v.ariaDisabled === "true";
        !p && !x && v.focus();
      }
    },
    compositeRef: m,
    index: f
  };
}
function Ix(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: u = xt,
    props: f = Gl,
    refs: p = Gl,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: x,
    compositeRef: S
  } = wM({
    metadata: g
  });
  return nt(d, n, {
    state: u,
    ref: [...p, S],
    props: [x, ...f, v],
    stateAttributesMapping: m
  });
}
function Bx(n) {
  if (Ct(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Bl(n))
    return Bx(Yl(n));
}
function Vx(n, o) {
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
const nc = 2, TM = Z0(function(o, a) {
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
    ...w
  } = o, A = ml(!0), E = S?.store ?? A?.store;
  if (!E)
    throw new Error(At(85));
  const N = Bn(m), M = E.useState("isTriggerActive", N), D = E.useState("floatingRootContext"), z = E.useState("isOpenedByTrigger", N), I = E.useState("triggerPopupId", N), j = y.useRef(null), H = CM(), _ = Np(!0), k = jo(), Y = y.useMemo(() => k ?? new Fp(), [k]), ne = Kp(Y), X = Kl(), {
    registerTrigger: Z,
    isMountedByThisTrigger: Q
  } = ng(N, j, E, {
    payload: C,
    closeDelay: x,
    parent: H,
    floatingTreeRoot: Y,
    floatingNodeId: ne,
    floatingParentNodeId: X,
    keyboardEventRelay: _?.relayKeyboardEvent
  }), q = H.type === "menubar", R = E.useState("disabled"), B = p || R || q && H.context.disabled, {
    getButtonProps: P,
    buttonRef: F
  } = Mo({
    disabled: B,
    native: g
  });
  y.useEffect(() => {
    !z && H.type === void 0 && (E.context.allowMouseUpTriggerRef.current = !1);
  }, [E, z, H.type]);
  const L = y.useRef(null), O = sn(), U = ze((he) => {
    if (!L.current)
      return;
    O.clear(), E.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(L.current, Se) || Le(E.select("positionerElement"), Se) || Se === L.current || Se != null && Bx(Se) === E.select("rootId"))
      return;
    const Te = Lx(L.current);
    he.clientX >= Te.left - nc && he.clientX <= Te.right + nc && he.clientY >= Te.top - nc && he.clientY <= Te.bottom + nc || Y.events.emit("close", {
      domEvent: he,
      reason: d0
    });
  });
  y.useEffect(() => {
    z && E.select("lastOpenChangeReason") === Pt && tt(L.current).addEventListener("mouseup", U, {
      once: !0
    });
  }, [z, U, E]);
  const te = q && H.context.hasSubmenuOpen, re = ou(D, {
    enabled: (d ?? te) && !B && H.type !== "context-menu" && (!q || te && !Q),
    handleClose: au({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: H.type === void 0 ? v : void 0,
    delay: {
      close: x
    },
    triggerElementRef: j,
    externalTree: Y,
    isActiveTrigger: M,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), ie = RM(z, E.select("lastOpenChangeReason")), oe = Kc(D, {
    enabled: !B && H.type !== "context-menu",
    event: z && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: H.type === void 0 ? ie : !1
  }), se = ox(D, {
    enabled: !B && te
  }), ge = EM({
    open: z,
    enabled: q,
    mouseDownAction: "open"
  }), je = y.useMemo(() => bn(se.reference, oe.reference), [se.reference, oe.reference]), Ee = E.useState("triggerProps", Q), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Re
  } = Vx(E, j), _e = {
    disabled: B,
    open: z
  }, ke = [L, a, F, Z, j], we = [je, re ?? xt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": I,
    id: N,
    onMouseDown: (he) => {
      if (E.select("open"))
        return;
      O.start(200, () => {
        E.context.allowMouseUpTriggerRef.current = !0;
      }), tt(he.currentTarget).addEventListener("mouseup", U, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, w, P], Ce = nt("button", o, {
    enabled: !q,
    stateAttributesMapping: Mc,
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
    stateAttributesMapping: Mc
  }) : z ? /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ b.jsx(Co, {
      ref: fe,
      onFocus: ye
    }, `${N}-pre-focus-guard`), /* @__PURE__ */ b.jsx(y.Fragment, {
      children: Ce
    }, N), /* @__PURE__ */ b.jsx(Co, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: Re
    }, `${N}-post-focus-guard`)]
  }) : /* @__PURE__ */ b.jsx(y.Fragment, {
    children: Ce
  }, N);
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
  const n = pu(!0), o = ml(!0), a = kx();
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
function Yx(n) {
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
    closeDelay: x = 0,
    disabled: S = !1,
    ...C
  } = o, w = Ai({
    label: p
  }), A = du(), {
    store: E
  } = ml(), N = Bn(g), M = E.useState("open"), D = E.useState("floatingRootContext"), z = E.useState("floatingTreeRoot"), I = E.useState("triggerPopupId", N), j = ex(N, E), H = y.useCallback((oe) => {
    const se = j(oe);
    return oe !== null && E.select("open") && E.select("activeTriggerId") == null && E.update({
      activeTriggerId: N,
      activeTriggerElement: oe,
      closeDelay: x
    }), se;
  }, [j, x, E, N]), _ = y.useRef(null), k = y.useCallback((oe) => {
    _.current = oe, E.set("activeTriggerElement", oe);
  }, [E]), Y = Hx();
  if (!Y?.parentMenu)
    throw new Error(At(37));
  E.useSyncedValue("closeDelay", x);
  const ne = Y.parentMenu, X = E.useState("disabled"), Z = ne.useState("disabled"), Q = S || X || Z, q = ne.useState("itemProps"), R = ne.useState("isActive", w.index), B = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      ne.select("highlightItemOnHover") && ne.set("activeIndex", w.index);
    }
  }), [ne, w.index]), {
    getItemProps: P,
    itemRef: F
  } = cg({
    closeOnClick: !1,
    disabled: Q,
    highlighted: R,
    id: N,
    store: E,
    typingRef: ne.context.typingRef,
    nativeButton: m,
    itemMetadata: B,
    nodeId: A?.context.nodeId
  }), L = E.useState("hoverEnabled"), O = ou(D, {
    enabled: L && d && !Q,
    handleClose: au({
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
    triggerElementRef: _,
    externalTree: z,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), te = Kc(D, {
    enabled: !Q,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? xt, J = E.useState("triggerProps", !0);
  return delete J.id, nt("div", o, {
    state: {
      disabled: Q,
      highlighted: R,
      open: M
    },
    stateAttributesMapping: iu,
    props: [te, O, J, q, {
      "aria-controls": I,
      tabIndex: M || R ? 0 : -1,
      onBlur() {
        R && ne.set("activeIndex", null);
      }
    }, C, P],
    ref: [a, w.ref, F, H, k]
  });
});
function lc({ ...n }) {
  return /* @__PURE__ */ b.jsx(Ux, { "data-slot": "dropdown-menu", ...n });
}
function oc({ ...n }) {
  return /* @__PURE__ */ b.jsx(TM, { "data-slot": "dropdown-menu-trigger", ...n });
}
function ai({
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
function wo({ ...n }) {
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
function Qr({
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
    ai,
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
              yi,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function Jd({
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
}, ii = {
  valid: null,
  touched: !1,
  dirty: !1,
  filled: !1,
  focused: !1
}, kM = {
  disabled: !1,
  ...ii
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
  touched: ii.touched,
  setTouched: an,
  dirty: ii.dirty,
  setDirty: an,
  filled: ii.filled,
  setFilled: an,
  focused: ii.focused,
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
function vu(n = !0) {
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
  } = gg(), p = Bn(o), g = a ? u : void 0, m = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), v = y.useRef(o != null), x = ze(() => {
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
      x();
      return;
    }
    if (S === void 0) {
      x();
      return;
    }
    d.current = !0, f(m.current, S);
  }, [o, i, g, f, a, p, m, x]), y.useEffect(() => x, [x]), u ?? p;
}
function Xx(n, o, a, i, u = !0, f) {
  const {
    registerFieldControl: p
  } = vu(), g = y.useRef(null);
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
    autoFocus: x = !1,
    style: S,
    ...C
  } = o, {
    state: w,
    name: A,
    disabled: E,
    setTouched: N,
    setDirty: M,
    validityData: D,
    setFocused: z,
    setFilled: I,
    validationMode: j,
    validation: H
  } = vu(), {
    clearErrors: _
  } = qx(), k = E || m, Y = A ?? p, ne = {
    ...w,
    disabled: k
  }, {
    labelId: X
  } = gg(), Z = mg({
    id: f
  });
  xe(() => {
    const L = g != null;
    H.inputRef.current?.value || L && g !== "" ? I(!0) : L && g === "" && I(!1);
  }, [H.inputRef, I, g]);
  const Q = y.useRef(null);
  xe(() => {
    x && Q.current === vn(tt(Q.current)) && z(!0);
  }, [x, z]);
  const [q] = ra({
    controlled: g,
    default: v,
    name: "FieldControl",
    state: "value"
  }), R = g !== void 0, B = R ? q : void 0, P = ze(() => H.inputRef.current?.value);
  return Xx(H.inputRef, Z, B, P, !k, p), nt("input", o, {
    ref: [a, Q],
    state: ne,
    props: [{
      id: Z,
      disabled: k,
      name: Y,
      ref: H.inputRef,
      "aria-labelledby": X,
      autoFocus: x,
      ...R ? {
        value: B
      } : {
        defaultValue: v
      },
      onChange(L) {
        const O = L.currentTarget.value;
        d?.(O, Ye(No, L.nativeEvent)), M(O !== D.initialValue), I(O !== ""), L.nativeEvent.defaultPrevented || (_(Y), H.change(O));
      },
      onFocus() {
        z(!0);
      },
      onBlur(L) {
        N(!0), z(!1), j === "onBlur" && H.commit(L.currentTarget.value);
      },
      onKeyDown(L) {
        L.currentTarget.tagName === "INPUT" && L.key === "Enter" && (N(!0), H.commit(L.currentTarget.value));
      }
    }, C, (L) => H.getValidationProps(k, L)],
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
function Nc({ className: n, ...o }) {
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
const PM = aa(
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
function mi({
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
const YM = aa(
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
function Dc({
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
function fr(n) {
  const o = y.useContext(Fx);
  if (o === void 0 && !n)
    throw new Error(At(47));
  return o;
}
function GM() {
  return {
    ...nu(),
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
  ...lu,
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
class hg extends Oi {
  constructor(o, a, i = !1) {
    const u = {
      ...GM(),
      ...o
    }, f = new sa();
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
    const i = a.reason === Pt, u = a.reason === ql && a.event.detail === 0, f = !o && (a.reason === Ti || a.reason == null), p = eg(a), g = this.select("activeTriggerId");
    if (!o && a.reason === f0 && a.trigger == null && g != null && (a.trigger = this.context.triggerElements.getById(g) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const m = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      $c(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(A0, () => {
      this.set("stickIfOpen", !1);
    }), gl.flushSync(m)) : m(), u || f ? this.set("instantType", u ? "click" : "dismiss") : a.reason === Ro ? this.set("instantType", "focus") : this.set("instantType", void 0);
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
    handle: g,
    triggerId: m,
    defaultTriggerId: d = null
  } = n, v = hg.useStore(g?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: m
  });
  tg(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", m);
  const x = v.useState("open"), S = v.useState("mounted"), C = v.useState("payload"), w = Kl() != null;
  v.useContextCallback("onOpenChange", u), v.useContextCallback("onOpenChangeComplete", f), tx(v, x), Wc(v);
  const {
    forceUnmount: A
  } = eu(x, v, () => {
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
    v.setOpen(!1, Ye(Gc));
  }, [v]);
  y.useImperativeHandle(n.actionsRef, () => ({
    unmount: A,
    close: E
  }), [A, E]);
  const N = x || S, M = y.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ b.jsxs(Fx.Provider, {
    value: M,
    children: [N && /* @__PURE__ */ b.jsx(FM, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: C
    }) : o]
  });
}
function XM(n) {
  return fr(!0) ? /* @__PURE__ */ b.jsx(xb, {
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
  const a = n.useState("floatingRootContext"), i = Ci(a, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: o === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  }), u = i.reference ?? xt, f = i.trigger ?? xt, p = y.useMemo(() => bn(ia, i.floating), [i.floating]);
  return tu(n, {
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
    delay: x = KM,
    closeDelay: S = 0,
    id: C,
    ...w
  } = o, A = fr(!0), E = m?.store ?? A?.store;
  if (!E)
    throw new Error(At(74));
  const N = Bn(C), M = E.useState("isTriggerActive", N), D = E.useState("floatingRootContext"), z = E.useState("isOpenedByTrigger", N), I = E.useState("triggerPopupId", N), j = y.useRef(null), {
    registerTrigger: H,
    isMountedByThisTrigger: _
  } = ng(N, j, E, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: S
  }), k = E.useState("openChangeReason"), Y = E.useState("stickIfOpen"), ne = E.useState("openMethod"), X = E.useState("focusManagerModal"), Z = ou(D, {
    enabled: !p && D != null && v && (ne !== "touch" || k !== ql),
    mouseOnly: !0,
    move: !1,
    handleClose: au(),
    restMs: x,
    delay: {
      close: S
    },
    triggerElementRef: j,
    isActiveTrigger: M,
    isClosing: () => E.select("transitionStatus") === "ending"
  }), Q = Kc(D, {
    enabled: D != null,
    stickIfOpen: Y
  }), q = wx(() => E.select("open"), (re) => {
    E.set("openMethod", re);
  }), R = E.useState("triggerProps", _), {
    getButtonProps: B,
    buttonRef: P
  } = Mo({
    disabled: p,
    native: g
  }), F = {
    open(re) {
      return re && k === ql ? Mc.open(re) : iu.open(re);
    }
  }, {
    preFocusGuardRef: L,
    handlePreFocusGuardFocus: O,
    handleFocusTargetFocus: U
  } = Vx(E, j), J = nt("button", o, {
    state: {
      disabled: p,
      open: z
    },
    ref: [P, a, H, j],
    props: [Q.reference, Z, R, q, {
      [z0]: "",
      id: N,
      "aria-haspopup": "dialog",
      "aria-expanded": z,
      "aria-controls": I
    }, w, B],
    stateAttributesMapping: F
  });
  return _ && !X ? /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ b.jsx(Co, {
      ref: L,
      onFocus: O
    }), /* @__PURE__ */ b.jsx(y.Fragment, {
      children: J
    }, N), /* @__PURE__ */ b.jsx(Co, {
      ref: E.context.triggerFocusTargetRef,
      onFocus: U
    })]
  }) : /* @__PURE__ */ b.jsx(y.Fragment, {
    children: J
  }, N);
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
  } = fr();
  return f.useState("mounted") || i ? /* @__PURE__ */ b.jsx(Kx.Provider, {
    value: i,
    children: /* @__PURE__ */ b.jsx(Xc, {
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
    positionMethod: g = "absolute",
    side: m = "bottom",
    align: d = "center",
    sideOffset: v = 0,
    alignOffset: x = 0,
    collisionBoundary: S = "clipping-ancestors",
    collisionPadding: C = 5,
    arrowPadding: w = 5,
    sticky: A = !1,
    disableAnchorTracking: E = !1,
    collisionAvoidance: N = Xp,
    ...M
  } = o, {
    store: D
  } = fr(), z = ZM(), I = Kp(), j = D.useState("floatingRootContext"), H = D.useState("mounted"), _ = D.useState("open"), k = D.useState("openChangeReason"), Y = D.useState("activeTriggerElement"), ne = D.useState("modal"), X = D.useState("openMethod"), Z = D.useState("positionerElement"), Q = D.useState("instantType"), q = D.useState("transitionStatus"), R = D.useState("hasViewport"), B = y.useRef(null), P = $p(Z, !1, !1), F = hu({
    anchor: p,
    floatingRootContext: j,
    positionMethod: g,
    mounted: H,
    side: m,
    sideOffset: v,
    align: d,
    alignOffset: x,
    arrowPadding: w,
    collisionBoundary: S,
    collisionPadding: C,
    sticky: A,
    disableAnchorTracking: E,
    keepMounted: z,
    nodeId: I,
    collisionAvoidance: N,
    adaptiveOrigin: R ? ug : void 0
  }), L = j.useState("domReferenceElement");
  xe(() => {
    const J = L, re = B.current;
    if (J && (B.current = J), re && J && J !== re) {
      D.set("instantType", void 0);
      const ie = new AbortController();
      return P(() => {
        D.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [L, P, D]), dg(_ && ne === !0 && k !== Pt, X === "touch", Z, Y);
  const O = y.useCallback((J) => {
    D.set("positionerElement", J);
  }, [D]), U = {
    open: _,
    side: F.side,
    align: F.align,
    anchorHidden: F.anchorHidden,
    instant: Q
  }, te = yu(o, U, {
    styles: F.positionerStyles,
    transitionStatus: q,
    props: M,
    refs: [a, O],
    hidden: !H,
    inert: !_
  });
  return /* @__PURE__ */ b.jsxs(Qx.Provider, {
    value: F,
    children: [H && ne === !0 && k !== Pt && /* @__PURE__ */ b.jsx(fu, {
      ref: D.context.internalBackdropRef,
      inert: uu(!_),
      cutout: Y
    }), /* @__PURE__ */ b.jsx(L0, {
      id: I,
      children: te
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
  } = fr(), v = $M(), x = gu() != null, {
    context: S,
    hasClosePart: C
  } = t2(), w = d.useState("open"), A = d.useState("openMethod"), E = d.useState("instantType"), N = d.useState("transitionStatus"), M = d.useState("popupProps"), D = d.useState("titleElementId"), z = d.useState("descriptionElementId"), I = d.useState("modal"), j = d.useState("mounted"), H = d.useState("openChangeReason"), _ = d.useState("activeTriggerElement"), k = d.useState("floatingRootContext"), Y = k.useState("floatingId"), ne = d.useState("disabled"), X = d.useState("openOnHover"), Z = d.useState("closeDelay"), Q = m.id ?? Y;
  Ql({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  }), ig(k, {
    enabled: X && !ne,
    closeDelay: Z
  });
  const q = p === void 0 ? W0(d.context.popupRef) : p, R = I !== !1 && C;
  d.useSyncedValue("focusManagerModal", R);
  const B = y.useCallback((L) => {
    d.set("popupElement", L);
  }, [d]), P = {
    open: w,
    side: v.side,
    align: v.align,
    instant: E,
    transitionStatus: N
  }, F = nt("div", o, {
    state: P,
    ref: [a, d.context.popupRef, B],
    props: [M, {
      id: Q,
      role: "dialog",
      ...ia,
      "aria-labelledby": D,
      "aria-describedby": z,
      onKeyDown(L) {
        x && Mi.has(L.key) && L.stopPropagation();
      }
    }, zi(N), m],
    stateAttributesMapping: l2
  });
  return /* @__PURE__ */ b.jsx(Fc, {
    context: k,
    openInteractionType: A,
    modal: R,
    disabled: !j || H === Pt,
    initialFocus: q,
    returnFocus: g,
    restoreFocus: "popup",
    previousFocusableElement: Ct(_) ? _ : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ b.jsx(n2, {
      value: S,
      children: F
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
  portalContainer: g,
  positionerClassName: m,
  ...d
}) {
  return /* @__PURE__ */ b.jsx(JM, { container: g, children: /* @__PURE__ */ b.jsx(
    WM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: u,
      anchor: f,
      className: Ke("tw:isolate tw:z-[var(--z-popover)]", m),
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
function jc({ className: n, ...o }) {
  return /* @__PURE__ */ b.jsx(
    r2,
    {
      "data-slot": "popover-title",
      className: Ke("tw:font-medium", n),
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
      className: Ke("tw:text-muted-foreground", n),
      ...o
    }
  );
}
function gc({
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
function Zl() {
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
function ir(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function c2(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : ir(o, i, a));
}
function hi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : ir(i, o, a));
}
function u2(n, o, a) {
  return n.filter((i) => !ir(o, i, a));
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
function tr(n, o) {
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
    return o == null ? !1 : a && Array.isArray(o) ? o.length > 0 : tr(o, i) !== "";
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
function si(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Ll = 1;
function nS(n, o) {
  return Math.max(0, n - o);
}
function g2(n, o) {
  if (o <= 0)
    return 0;
  const a = si(n, 0, o), i = a, u = o - a, f = i <= Ll, p = u <= Ll;
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
    disabled: x = !1,
    readOnly: S = !1,
    required: C = !1,
    modal: w = !0,
    actionsRef: A,
    inputRef: E,
    onOpenChangeComplete: N,
    items: M,
    multiple: D = !1,
    itemToStringLabel: z,
    itemToStringValue: I,
    isItemEqualToValue: j = s2,
    highlightItemOnHover: H = !0,
    children: _
  } = n, {
    clearErrors: k
  } = qx(), {
    setDirty: Y,
    setTouched: ne,
    setFocused: X,
    validityData: Z,
    setFilled: Q,
    name: q,
    disabled: R,
    validation: B,
    validationMode: P
  } = vu(), F = mg({
    id: o
  }), L = R || x, O = q ?? m, [U, te] = ra({
    controlled: a,
    default: D ? i ?? Gl : i,
    name: "Select",
    state: "value"
  }), [J, re] = ra({
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
  } = Jc(J), {
    openMethod: Te,
    triggerProps: Oe
  } = Ex(J), He = xn(() => new J0({
    id: F,
    labelId: void 0,
    modal: w,
    multiple: D,
    itemToStringLabel: z,
    itemToStringValue: I,
    isItemEqualToValue: j,
    value: U,
    open: J,
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
  })).current, ae = Pe(He, Be.activeIndex), pe = Pe(He, Be.selectedIndex), Ue = Pe(He, Be.triggerElement), ve = Pe(He, Be.positionerElement), be = OM(Te), We = Te ?? be ?? null, rt = y.useMemo(() => D ? "" : tr(U, I), [D, U, I]), mt = y.useMemo(() => D && Array.isArray(U) ? U.map((qe) => tr(qe, I)) : tr(U, I), [D, U, I]), Dt = Yt(He.state.triggerElement), et = ze(() => mt);
  Xx(Dt, F, U, et, !L, m);
  const ht = y.useRef(U), zt = D ? Array.isArray(U) && U.length > 0 : U != null && tr(U, I) !== "";
  xe(() => {
    U !== ht.current && He.set("forceMount", !0);
  }, [He, U]), xe(() => {
    Q(zt);
  }, [zt, Q]), xe(function() {
    const St = fe.current;
    let Xt;
    if (D) {
      const ln = Array.isArray(U) ? U : [];
      if (ln.length === 0)
        Xt = null;
      else {
        const en = ln[ln.length - 1], Ot = hi(St, en, j);
        Xt = Ot === -1 ? null : Ot;
      }
    } else {
      const ln = hi(St, U, j);
      Xt = ln === -1 ? null : ln;
    }
    Xt === null && (_e.current = null), !J && He.set("selectedIndex", Xt);
  }, [zt, D, J, U, fe, j, He, _e]);
  function yt(qe) {
    const St = Z.initialValue;
    return Array.isArray(qe) && Array.isArray(St) ? !p2(qe, St, (Xt, ln) => ir(Xt, ln, j)) : qe !== St;
  }
  Sx(U, () => {
    k(O), Y(yt(U)), B.change(U);
  });
  const Mn = ze((qe, St) => {
    g?.(qe, St), !St.isCanceled && (re(qe), !qe && (St.reason === Ro || St.reason === Yc) && (ne(!0), X(!1), P === "onBlur" && B.commit(U)));
  }), An = ze(() => {
    he(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), N?.(!1);
  });
  Ql({
    enabled: !A,
    open: J,
    ref: se,
    onComplete() {
      J || An();
    }
  }), y.useImperativeHandle(A, () => ({
    unmount: An
  }), [An]);
  const Qe = ze((qe, St) => {
    u?.(qe, St), !St.isCanceled && te(qe);
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
  }), Ht = Kc(It, {
    enabled: !S && !L,
    event: "mousedown"
  }), Ut = Ci(It), jt = ax(It, {
    enabled: !S && !L,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: Gl,
    onNavigate(qe) {
      qe === null && !J || He.set("activeIndex", qe);
    },
    focusItemOnHover: H
  }), Gt = ix(It, {
    enabled: !S && !L && (J || !D),
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
    return F && (qe.id = F), qe;
  }, [Ht.reference, Gt.reference, jt.reference, Ut.reference, Oe, F]), zn = y.useMemo(() => bn(ia, Gt.floating, jt.floating, Ut.floating), [Gt.floating, jt.floating, Ut.floating]), Vn = jt.item ?? xt;
  _p(() => {
    He.update({
      popupProps: zn,
      triggerProps: Sn
    });
  }), xe(() => {
    He.update({
      id: F,
      modal: w,
      multiple: D,
      value: U,
      open: J,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: zn,
      triggerProps: Sn,
      items: M,
      itemToStringLabel: z,
      itemToStringValue: I,
      isItemEqualToValue: j,
      openMethod: We
    });
  }, [He, F, w, D, U, J, Ce, Se, zn, Sn, M, z, I, j, We]);
  const qt = y.useMemo(() => ({
    store: He,
    name: O,
    required: C,
    disabled: L,
    readOnly: S,
    multiple: D,
    highlightItemOnHover: H,
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
    validation: B,
    onOpenChangeComplete: N,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: ht
  }), [He, O, C, L, S, D, H, Qe, Mn, Vn, B, N, pt]), Pn = To(E, B.inputRef), hl = D && Array.isArray(U) && U.length > 0, tl = D ? void 0 : O, yl = y.useMemo(() => !D || !Array.isArray(U) || !O ? null : U.map((qe) => {
    const St = tr(qe, I);
    return /* @__PURE__ */ b.jsx("input", {
      type: "hidden",
      form: d,
      name: O,
      value: St,
      disabled: L
    }, St);
  }), [D, U, d, O, I, L]);
  return /* @__PURE__ */ b.jsx(Zx.Provider, {
    value: qt,
    children: /* @__PURE__ */ b.jsxs(Jx.Provider, {
      value: It,
      children: [_, /* @__PURE__ */ b.jsx("input", {
        ...B.getValidationProps(L, {
          onFocus() {
            He.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              focusVisible: !0
            });
          },
          // Handle browser autofill.
          onChange(qe) {
            if (qe.nativeEvent.defaultPrevented || L || S)
              return;
            const St = qe.currentTarget.value, Xt = Ye(No, qe.nativeEvent);
            function ln() {
              if (D)
                return;
              const en = St.toLowerCase();
              let Ot = fe.current.findIndex((rl) => tr(rl, I).toLowerCase() === en || eS(rl, z).toLowerCase() === en);
              Ot === -1 && (Ot = fe.current.findIndex((rl, ca) => {
                const Di = oe.current[ca];
                return Di != null && Di.toLowerCase() === en;
              }));
              const cn = Ot === -1 ? void 0 : fe.current[Ot];
              cn != null && Qe(cn, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(ln);
          }
        }),
        id: F && tl == null ? `${F}-hidden-input` : void 0,
        form: d,
        name: tl,
        autoComplete: v,
        value: rt,
        disabled: L,
        required: C && !hl,
        readOnly: S,
        ref: Pn,
        style: O ? xR : m0,
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
const rc = 2, y2 = 400, v2 = {
  ...Mc,
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
    nativeButton: g = !0,
    style: m,
    ...d
  } = o, {
    setTouched: v,
    setFocused: x,
    validationMode: S,
    state: C,
    disabled: w
  } = vu(), {
    labelId: A
  } = gg(), {
    store: E,
    setOpen: N,
    selectionRef: M,
    validation: D,
    readOnly: z,
    required: I,
    alignItemWithTriggerActiveRef: j,
    disabled: H
  } = Zl(), _ = w || H || p, k = Pe(E, Be.open), Y = Pe(E, Be.mounted), ne = Pe(E, Be.value), X = Pe(E, Be.triggerProps), Z = Pe(E, Be.positionerElement), Q = Pe(E, Be.listElement), q = Pe(E, Be.popupSide), R = Pe(E, Be.id), B = Pe(E, Be.labelId), P = Pe(E, Be.hasSelectedValue), F = Y && Z ? q : null, L = f ?? R, O = h2(A, B);
  mg({
    id: L
  });
  const U = Yt(Z), te = y.useRef(null), {
    getButtonProps: J,
    buttonRef: re
  } = Mo({
    disabled: _,
    native: g
  }), ie = ze((ye) => {
    E.set("triggerElement", ye);
  }), oe = sn(), se = sn(), ge = sn();
  y.useEffect(() => {
    if (k)
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
  }, [k, M, se, ge]);
  const je = bn(X, {
    id: L,
    role: "combobox",
    "aria-expanded": k ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": k ? Q?.id ?? xc(Z)?.id : void 0,
    "aria-labelledby": O,
    "aria-readonly": z || void 0,
    "aria-required": I || void 0,
    tabIndex: _ ? -1 : 0,
    onFocus(ye) {
      x(!0), k && j.current && N(!1, Ye(No, ye.nativeEvent)), oe.start(0, () => {
        E.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(Z, ye.relatedTarget) || (v(!0), x(!1), S === "onBlur" && D.commit(ne));
    },
    onMouseDown(ye) {
      if (k)
        return;
      const Re = tt(ye.currentTarget);
      function _e(ke) {
        if (!te.current)
          return;
        const we = ke.target;
        if (Le(te.current, we) || Le(U.current, we))
          return;
        const Ce = Lx(te.current);
        ke.clientX >= Ce.left - rc && ke.clientX <= Ce.right + rc && ke.clientY >= Ce.top - rc && ke.clientY <= Ce.bottom + rc || N(!1, Ye(d0, ke));
      }
      se.start(0, () => {
        Re.addEventListener("mouseup", _e, {
          once: !0
        });
      });
    }
  }, d, J), Ee = D.getValidationProps(_, je);
  Ee.role = "combobox";
  const fe = {
    ...C,
    open: k,
    disabled: _,
    value: ne,
    readOnly: z,
    popupSide: F,
    placeholder: !P
  };
  return nt("button", o, {
    ref: [a, te, re, ie],
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
  } = Zl(), x = Pe(d, Be.value), S = Pe(d, Be.items), C = Pe(d, Be.itemToStringLabel), w = Pe(d, Be.hasSelectedValue), A = !w && p != null && f == null, E = Pe(d, Be.hasNullItemLabel, A), N = {
    value: x,
    placeholder: !w
  };
  let M = null;
  return typeof f == "function" ? M = f(x) : f != null ? M = f : !w && p != null && !E ? M = p : Array.isArray(x) ? M = d2(x, S, C) : M = tS(x, S, C), nt("span", o, {
    state: N,
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
    stateAttributesMapping: iu
  });
}), E2 = /* @__PURE__ */ y.createContext(void 0), T2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    store: i
  } = Zl(), u = Pe(i, Be.mounted), f = Pe(i, Be.forceMount);
  return u || f ? /* @__PURE__ */ b.jsx(E2.Provider, {
    value: !0,
    children: /* @__PURE__ */ b.jsx(Xc, {
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
function kc(n, o) {
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
    side: g = "bottom",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A,
    alignItemWithTrigger: E = !0,
    collisionAvoidance: N = N0,
    style: M,
    ...D
  } = o, {
    store: z,
    listRef: I,
    labelsRef: j,
    alignItemWithTriggerActiveRef: H,
    selectedItemTextRef: _,
    valuesRef: k,
    initialValueRef: Y,
    popupRef: ne,
    setValue: X
  } = Zl(), Z = $x(), Q = Pe(z, Be.open), q = Pe(z, Be.mounted), R = Pe(z, Be.modal), B = Pe(z, Be.value), P = Pe(z, Be.openMethod), F = Pe(z, Be.positionerElement), L = Pe(z, Be.triggerElement), O = Pe(z, Be.isItemEqualToValue), U = Pe(z, Be.transitionStatus), te = y.useRef(null), J = y.useRef(null), [re, ie] = y.useState(E), oe = q && re && P !== "touch";
  !q && re !== E && ie(E), xe(() => {
    q || (Be.scrollUpArrowVisible(z.state) && z.set("scrollUpArrowVisible", !1), Be.scrollDownArrowVisible(z.state) && z.set("scrollDownArrowVisible", !1));
  }, [z, q]), y.useImperativeHandle(H, () => oe), dg((oe || R) && Q, P === "touch", F, L);
  const se = hu({
    anchor: i,
    floatingRootContext: Z,
    positionMethod: u,
    mounted: q,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    arrowPadding: C,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: w,
    disableAnchorTracking: A ?? oe,
    collisionAvoidance: N,
    keepMounted: !0
  }), ge = oe ? "none" : se.side, je = oe ? R2 : se.positionerStyles, Ee = {
    open: Q,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    z.set("popupSide", se.side);
  }, [z, se.side]);
  const fe = ze((we) => {
    z.set("positionerElement", we);
  }), ye = yu(o, Ee, {
    styles: je,
    transitionStatus: U,
    props: D,
    refs: [a, fe],
    hidden: !q,
    inert: !Q
  }), Re = y.useRef(0), _e = ze((we) => {
    if (we.size === 0 && Re.current === 0 || k.current.length === 0)
      return;
    const Ce = Re.current;
    if (Re.current = we.size, we.size === Ce)
      return;
    const he = Ye(No);
    if (Ce !== 0 && !z.state.multiple && B !== null && hi(k.current, B, O) === -1) {
      const Te = Y.current, He = Te != null && hi(k.current, Te, O) !== -1 ? Te : null;
      X(He, he), He === null && (z.set("selectedIndex", null), _.current = null);
    }
    if (Ce !== 0 && z.state.multiple && Array.isArray(B)) {
      const Se = (Oe) => hi(k.current, Oe, O) !== -1, Te = B.filter((Oe) => Se(Oe));
      (Te.length !== B.length || Te.some((Oe) => !c2(B, Oe, O))) && (X(Te, he), Te.length === 0 && (z.set("selectedIndex", null), _.current = null));
    }
    if (Q && oe) {
      z.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      kc(F, Se), kc(ne.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: oe,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: te,
    scrollDownArrowRef: J
  }), [se, ge, oe, ie]);
  return /* @__PURE__ */ b.jsx(fg, {
    elementsRef: I,
    labelsRef: j,
    onMapChange: _e,
    children: /* @__PURE__ */ b.jsxs(lS.Provider, {
      value: ke,
      children: [q && R && /* @__PURE__ */ b.jsx(fu, {
        inert: uu(!Q),
        cutout: L
      }), ye]
    })
  });
}), ac = "base-ui-disable-scrollbar", wp = {
  className: ac,
  getElement(n) {
    return /* @__PURE__ */ b.jsx("style", {
      nonce: n,
      href: ac,
      precedence: "base-ui:low",
      children: `.${ac}{scrollbar-width:none}.${ac}::-webkit-scrollbar{display:none}`
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
}, N2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
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
    selectedItemTextRef: w,
    multiple: A,
    handleScrollArrowVisibility: E,
    scrollHandlerRef: N,
    listRef: M,
    highlightItemOnHover: D
  } = Zl(), {
    side: z,
    align: I,
    alignItemWithTriggerActive: j,
    isPositioned: H,
    setControlledAlignItemWithTrigger: _
  } = oS(), k = gu() != null, Y = $x(), ne = mu(), {
    nonce: X,
    disableStyleElements: Z
  } = A2(), Q = Pe(m, Be.id), q = Pe(m, Be.open), R = Pe(m, Be.openMethod), B = Pe(m, Be.mounted), P = Pe(m, Be.popupProps), F = Pe(m, Be.transitionStatus), L = Pe(m, Be.triggerElement), O = Pe(m, Be.positionerElement), U = Pe(m, Be.listElement), te = y.useRef(!1), J = y.useRef(!1), re = y.useRef({}), ie = na(), oe = ze((Ee) => {
    if (!O || !d.current || !J.current)
      return;
    if (te.current || !j) {
      E();
      return;
    }
    const fe = O.style.top === "0px", ye = O.style.bottom === "0px";
    if (!fe && !ye) {
      E();
      return;
    }
    const Re = wb(O), _e = ci(O.getBoundingClientRect().height, "y", Re), ke = tt(O), we = Nt(O), Ce = we.getComputedStyle(O), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Te = Sb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Te), He = Ee.scrollTop, ae = ic(Ee);
    let pe = 0, Ue = null, ve = !1, be = !1;
    const We = (et) => {
      O.style.height = `${et}px`;
    }, rt = (et, ht) => {
      const zt = si(et, 0, Oe - _e);
      zt > 0 && We(_e + zt), Ee.scrollTop = ht, Oe - (_e + zt) <= Ll && (te.current = !0), E();
    }, mt = fe ? ae - He : He, Dt = Math.min(_e + mt, Oe);
    if (pe = Dt, mt <= Ll) {
      rt(mt, fe ? ae : 0);
      return;
    }
    if (Oe - Dt > Ll)
      fe ? be = !0 : Ue = 0;
    else if (ve = !0, ye && He < ae) {
      const et = _e + mt - Oe;
      Ue = He - (mt - et);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), be || Ue != null) {
      const et = ic(Ee), ht = be ? et : si(Ue, 0, et);
      Math.abs(Ee.scrollTop - ht) > Ll && (Ee.scrollTop = ht);
    }
    (ve || pe >= Oe - Ll) && (te.current = !0), E();
  });
  y.useImperativeHandle(N, () => oe, [oe]), Ql({
    open: q,
    ref: d,
    onComplete() {
      q && v?.(!0);
    }
  });
  const se = {
    open: q,
    transitionStatus: F,
    side: z,
    align: I
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
    q || j || (J.current = !1, te.current = !1, kc(O, re.current));
  }, [q, j, O, d]), xe(() => {
    const Ee = d.current;
    if (!q || !L || !O || !Ee || j && !H || m.state.transitionStatus === "ending")
      return;
    if (!j) {
      J.current = !0, ie.request(E), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = D2(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = w.current;
      ye?.isConnected || (ye = !Be.hasSelectedValue(m.state) && C.current?.isConnected ? C.current : null);
      const Re = S.current, _e = Nt(O), ke = _e.getComputedStyle(O), we = _e.getComputedStyle(Ee), Ce = tt(L), he = wb(L), Se = sc(L.getBoundingClientRect(), he), Te = sc(O.getBoundingClientRect(), he), Oe = Se.height, He = U || Ee, ae = He.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, ve = parseFloat(ke.marginBottom) || 10, be = parseFloat(ke.minHeight) || 100, We = Sb(we), rt = 5, mt = 5, Dt = 20, et = Ce.documentElement.clientHeight - Ue - ve, ht = Ce.documentElement.clientWidth, zt = et - Se.bottom + Oe;
      let yt, Mn = ne === "rtl" ? Se.right - Te.width : Se.left, An = 0;
      if (ye && Re) {
        const qt = sc(Re.getBoundingClientRect(), he);
        yt = sc(ye.getBoundingClientRect(), he), Mn = Te.left + (ne === "rtl" ? qt.right - yt.right : qt.left - yt.left);
        const Pn = qt.top - Se.top + qt.height / 2;
        An = yt.top - Te.top + yt.height / 2 - Pn;
      }
      const Qe = zt + An + ve + pe;
      let pt = Math.min(et, Qe);
      const It = et - Ue - ve, Ht = Qe - pt, Ut = ht - mt;
      O.style.left = `${si(Mn, rt, Ut - Te.width)}px`, O.style.height = `${pt}px`, O.style.maxHeight = "none", O.style.marginTop = `${Ue}px`, O.style.marginBottom = `${ve}px`, Ee.style.height = "100%";
      const jt = ic(He), Gt = Ht >= jt - Ll;
      Gt && (pt = Math.min(et, Te.height) - (Ht - jt));
      const Sn = Se.top < Dt || Se.bottom > et - Dt || Math.ceil(pt) + Ll < Math.min(ae, be), zn = (_e.visualViewport?.scale ?? 1) !== 1 && zo;
      if (Sn || zn) {
        J.current = !0, kc(O, re.current), _(!1);
        return;
      }
      const Vn = Math.max(be, pt);
      if (Gt) {
        const qt = Math.max(0, et - Qe);
        O.style.top = Te.height >= It ? "0" : `${qt}px`, O.style.height = `${pt}px`, He.scrollTop = ic(He);
      } else
        O.style.bottom = "0", He.scrollTop = Ht;
      if (yt) {
        const qt = Te.top, Pn = Te.height, hl = yt.top + yt.height / 2, tl = Pn > 0 ? (hl - qt) / Pn * 100 : 50, yl = si(tl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${yl}%`);
      }
      (Vn === et || pt >= We) && (te.current = !0), E(), D && m.state.selectedIndex === null && m.state.activeIndex === null && M.current[0] != null && m.set("activeIndex", 0), J.current = !0;
    } finally {
      fe();
    }
  }, [m, q, O, L, S, C, w, d, E, j, _, ie, U, M, D, ne, H]), y.useEffect(() => {
    if (!j || !O || !q)
      return;
    const Ee = Nt(O);
    function fe(ye) {
      x(!1, Ye(mR, ye));
    }
    return Je(Ee, "resize", fe);
  }, [x, j, O, q]);
  const ge = {
    ...U ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": A || void 0,
      id: `${Q}-list`
    },
    onKeyDown(Ee) {
      k && Mi.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      U || oe(Ee.currentTarget);
    },
    ...j && {
      style: U ? {
        height: "100%"
      } : rS
    }
  }, je = nt("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: z2,
    props: [P, ge, zi(F), {
      className: !U && j ? wp.className : void 0
    }, g]
  });
  return /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [!Z && wp.getElement(X), /* @__PURE__ */ b.jsx(Fc, {
      context: Y,
      modal: !1,
      disabled: !B,
      openInteractionType: R,
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
function ic(n) {
  return nS(n.scrollHeight, n.clientHeight);
}
function wb(n) {
  return q0.getScale(n);
}
function ci(n, o, a) {
  return n / a[o];
}
function sc(n, o) {
  return xi({
    x: ci(n.x, "x", o),
    y: ci(n.y, "y", o),
    width: ci(n.width, "x", o),
    height: ci(n.height, "y", o)
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
    store: g,
    scrollHandlerRef: m
  } = Zl(), {
    alignItemWithTriggerActive: d
  } = oS(), v = Pe(g, Be.hasScrollArrows), x = Pe(g, Be.openMethod), S = Pe(g, Be.multiple), w = {
    id: `${Pe(g, Be.id)}-list`,
    role: "listbox",
    "aria-multiselectable": S || void 0,
    onScroll(E) {
      m.current?.(E.currentTarget);
    },
    ...d && {
      style: rS
    },
    className: v && x !== "touch" ? wp.className : void 0
  }, A = ze((E) => {
    g.set("listElement", E);
  });
  return nt("div", o, {
    ref: [a, A],
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
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...v
  } = o, x = y.useRef(null), S = Ai({
    label: g,
    textRef: x,
    indexGuessBehavior: Ax.GuessFromOrder
  }), {
    store: C,
    itemProps: w,
    setOpen: A,
    setValue: E,
    selectionRef: N,
    typingRef: M,
    valuesRef: D,
    multiple: z,
    selectedItemTextRef: I,
    disabled: j,
    readOnly: H
  } = Zl(), _ = Pe(C, Be.isActive, S.index), k = Pe(C, Be.open), Y = Pe(C, Be.isSelected, p), ne = Pe(C, Be.isSelectedByFocus, S.index), X = Pe(C, Be.isItemEqualToValue), Z = S.index, Q = Z !== -1, q = y.useRef(null);
  xe(() => {
    if (!Q)
      return;
    const oe = D.current;
    return oe[Z] = p, () => {
      delete oe[Z];
    };
  }, [Q, Z, p, D]), xe(() => {
    if (!Q)
      return;
    const oe = C.state.value;
    let se = oe;
    z && Array.isArray(oe) && (se = oe.length > 0 ? oe[oe.length - 1] : void 0), se !== void 0 && ir(p, se, X) && (C.set("selectedIndex", Z), x.current && (I.current = x.current));
  }, [Q, Z, z, X, C, p, I]);
  const R = y.useRef(null), B = y.useRef("mouse"), P = y.useRef(!1), {
    getButtonProps: F,
    buttonRef: L
  } = Mo({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), O = {
    disabled: m,
    selected: Y,
    highlighted: _
  };
  function U(oe) {
    if (j || H)
      return;
    const se = C.state.value;
    if (z) {
      const ge = Array.isArray(se) ? se : [], je = Y ? u2(ge, p, X) : [...ge, p];
      E(je, Ye($r, oe));
    } else
      E(p, Ye($r, oe)), A(!1, Ye($r, oe));
  }
  function te() {
    N.current.dragY = 0;
  }
  const J = {
    role: "option",
    "aria-selected": Y,
    tabIndex: k && _ ? 0 : -1,
    onKeyDown(oe) {
      R.current = oe.key, C.set("activeIndex", Z), oe.key === " " && M.current && oe.preventDefault();
    },
    onClick(oe) {
      const se = oe.type === "click" && B.current !== "touch", ge = oe.nativeEvent.pointerType, je = se && Ip(oe.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || _), Ee = se && !je && !P.current;
      P.current = !1, !(oe.type === "keydown" && R.current === null) && (m || oe.type === "keydown" && R.current === " " && M.current || Ee || (R.current = null, U(oe.nativeEvent)));
    },
    onPointerEnter(oe) {
      B.current = oe.pointerType;
    },
    onPointerMove(oe) {
      if (oe.pointerType === "mouse" && oe.buttons === 1) {
        const se = N.current;
        se.dragY += oe.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(oe) {
      B.current = oe.pointerType, P.current = !0, te();
    },
    onMouseUp() {
      if (te(), m || B.current === "touch" || P.current)
        return;
      const oe = !N.current.allowSelectedMouseUp && Y, se = !N.current.allowUnselectedMouseUp && !Y;
      oe || se || (P.current = !0, q.current?.click(), P.current = !1);
    }
  }, re = nt("div", o, {
    ref: [L, a, S.ref, q],
    state: O,
    props: [w, J, v, F]
  }), ie = y.useMemo(() => ({
    selected: Y,
    index: Z,
    textRef: x,
    selectedByFocus: ne,
    hasRegistered: Q
  }), [Y, Z, x, ne, Q]);
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
    selected: g
  } = yg(), m = y.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = Jc(g), S = nt("span", n, {
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
  return Ql({
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
  } = yg(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Zl(), {
    render: d,
    className: v,
    style: x,
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
        /* @__PURE__ */ b.jsx(w2, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(mc, {}) })
      ]
    }
  );
}
function fS({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  ...u
}) {
  return /* @__PURE__ */ b.jsx(T2, { container: a, children: /* @__PURE__ */ b.jsx(
    C2,
    {
      sideOffset: 4,
      className: Ke("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ b.jsx(
        N2,
        {
          "data-slot": "select-content",
          className: Ke(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[length:var(--fs-body-s)] tw:text-popover-foreground tw:shadow-[var(--elevation-overlay)] tw:outline-none",
            n
          ),
          ...u,
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
        /* @__PURE__ */ b.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(_2, { children: /* @__PURE__ */ b.jsx(yi, { "data-icon": "select-check" }) }) }),
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
                /* @__PURE__ */ b.jsx(ui, {}),
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
    onPressedChange: g,
    pressed: m,
    render: d,
    type: v,
    // cannot change button type
    value: x,
    nativeButton: S = !0,
    style: C,
    ...w
  } = o, A = Bn(x || void 0), E = K2(), N = E?.value ?? [], M = E ? void 0 : u, D = (f || E?.disabled) ?? !1, [z, I] = ra({
    controlled: E ? A !== void 0 && N.indexOf(A) > -1 : m,
    default: M,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: j,
    buttonRef: H
  } = Mo({
    disabled: D,
    native: S
  }), _ = {
    disabled: D,
    pressed: z
  }, k = [H, a], Y = [{
    "aria-pressed": z,
    onClick(Z) {
      const Q = !z, q = Ye(No, Z.nativeEvent);
      g?.(Q, q), !q.isCanceled && (A && E?.setGroupValue?.(A, Q, q), !q.isCanceled && I(Q));
    }
  }, w, j], ne = nt("button", o, {
    enabled: !E,
    state: _,
    ref: k,
    props: Y
  }), X = y.useMemo(() => ({
    disabled: D,
    focusableWhenDisabled: !1
  }), [D]);
  return E ? /* @__PURE__ */ b.jsx(Ix, {
    tag: "button",
    render: d,
    className: i,
    style: C,
    metadata: X,
    state: _,
    refs: k,
    props: Y
  }) : ne;
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
    disabledIndices: x,
    modifierKeys: S = J2
  } = n, [C, w] = y.useState(0), A = i != null, E = y.useRef(null), N = To(E, m), M = y.useRef([]), D = y.useRef(!1), z = p ?? C, I = ze((Y, ne = !1) => {
    if ((g ?? w)(Y), ne) {
      const X = M.current[Y];
      pb(E.current, X, f, a);
    }
  }), j = ze((Y) => {
    if (Y.size === 0 || D.current)
      return;
    D.current = !0;
    const ne = Array.from(Y.keys()), X = ne.find((Q) => Q?.hasAttribute(Z2)) ?? null, Z = X ? ne.indexOf(X) : -1;
    if (Z !== -1)
      I(Z);
    else if (Ec(ne, z, x)) {
      const Q = Il(ne, {
        disabledIndices: x
      });
      fi(ne, Q) || I(Q);
    }
    pb(E.current, X, f, a);
  });
  xe(() => {
    if (x == null || p != null || !D.current)
      return;
    const Y = M.current;
    if (Ec(Y, z, x)) {
      const ne = Il(Y, {
        disabledIndices: x
      });
      fi(Y, ne) || I(ne);
    }
  }, [x, p, z, M, I]);
  const H = ze((Y, ne, X) => u ? u(Y, ne, X, M) : X), _ = ze((Y) => {
    const ne = d ? Mi : yx;
    if (!ne.has(Y.key) || W2(Y, S) || !E.current)
      return;
    const Z = f === "rtl", Q = Z ? Ac : zc, q = {
      horizontal: Q,
      vertical: gi,
      both: Q
    }[a], R = Z ? zc : Ac, B = {
      horizontal: R,
      vertical: pi,
      both: R
    }[a], P = gn(Y.nativeEvent);
    if (P != null && db(P) && !Yx(P)) {
      const re = P.selectionStart, ie = P.selectionEnd, oe = P.value ?? "";
      if (re == null || Y.shiftKey || re !== ie || Y.key !== B && re < oe.length || Y.key !== q && re > 0)
        return;
    }
    let F = z;
    const L = uc(M, x), O = gp(M, x);
    i != null && (F = i({
      disabledIndices: x,
      elementsRef: M,
      event: Y,
      highlightedIndex: z,
      loopFocus: o,
      maxIndex: O,
      minIndex: L,
      onLoop: H,
      orientation: a,
      rtl: Z
    }));
    const U = {
      horizontal: [Q],
      vertical: [gi],
      both: [Q, gi]
    }[a], te = {
      horizontal: [R],
      vertical: [pi],
      both: [R, pi]
    }[a], J = A ? ne : {
      horizontal: d ? TO : mx,
      vertical: d ? RO : hx,
      both: ne
    }[a];
    d && (Y.key === su ? F = L : Y.key === cu && (F = O)), F === z && (U.includes(Y.key) || te.includes(Y.key)) && (o && F === O && U.includes(Y.key) ? (F = L, u && (F = u(Y, z, F, M))) : o && F === L && te.includes(Y.key) ? (F = O, u && (F = u(Y, z, F, M))) : F = Il(M.current, {
      startingIndex: F,
      decrement: te.includes(Y.key),
      disabledIndices: x
    })), F !== z && !fi(M.current, F) && (v && Y.stopPropagation(), J.has(Y.key) && Y.preventDefault(), I(F, !0), queueMicrotask(() => {
      M.current[F]?.focus();
    }));
  });
  return {
    props: {
      ref: N,
      onFocus(Y) {
        const ne = E.current, X = gn(Y.nativeEvent);
        !ne || X == null || !db(X) || X.setSelectionRange(0, X.value.length ?? 0);
      },
      onKeyDown: _
    },
    highlightedIndex: z,
    onHighlightedIndexChange: I,
    elementsRef: M,
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
    refs: u = Gl,
    props: f = Gl,
    state: p = xt,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: x,
    loopFocus: S,
    onLoop: C,
    enableHomeAndEndKeys: w,
    onMapChange: A,
    stopEventPropagation: E = !0,
    rootRef: N,
    disabledIndices: M,
    modifierKeys: D,
    highlightItemOnHover: z = !1,
    tag: I = "div",
    ...j
  } = n, H = mu(), {
    props: _,
    highlightedIndex: k,
    onHighlightedIndexChange: Y,
    elementsRef: ne,
    onMapChange: X,
    relayKeyboardEvent: Z
  } = $2({
    grid: x,
    loopFocus: S,
    onLoop: C,
    orientation: v,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: N,
    stopEventPropagation: E,
    enableHomeAndEndKeys: w,
    direction: H,
    disabledIndices: M,
    modifierKeys: D
  }), Q = nt(I, n, {
    state: p,
    ref: u,
    props: [_, ...f, j],
    stateAttributesMapping: g
  }), q = y.useMemo(() => ({
    highlightedIndex: k,
    onHighlightedIndexChange: Y,
    highlightItemOnHover: z,
    relayKeyboardEvent: Z
  }), [k, Y, z, Z]);
  return /* @__PURE__ */ b.jsx(Vb.Provider, {
    value: q,
    children: /* @__PURE__ */ b.jsx(fg, {
      elementsRef: ne,
      onMapChange: (R) => {
        A?.(R), X(R);
      },
      children: Q
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
    orientation: g = "horizontal",
    multiple: m = !1,
    value: d,
    className: v,
    render: x,
    style: S,
    ...C
  } = o, w = gu(), A = nA(), E = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), N = (w?.disabled ?? !1) || (A?.disabled ?? !1) || u, [M, D] = ra({
    controlled: d,
    default: d === void 0 ? i ?? Gl : void 0,
    name: "ToggleGroup",
    state: "value"
  }), z = ze((k, Y, ne) => {
    let X;
    m ? (X = M.slice(), Y ? X.push(k) : X.splice(M.indexOf(k), 1)) : X = Y ? [k] : [], p?.(X, ne), !ne.isCanceled && D(X);
  }), I = {
    disabled: N,
    multiple: m,
    orientation: g
  }, j = y.useMemo(() => ({
    disabled: N,
    orientation: g,
    setGroupValue: z,
    value: M,
    isValueInitialized: E
  }), [N, g, z, M, E]), H = {
    role: "group"
  }, _ = nt("div", o, {
    enabled: !!w,
    state: I,
    ref: a,
    props: [H, C],
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
      props: [H, C],
      stateAttributesMapping: Tb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), rA = aa(
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
function Ni(n) {
  const o = y.useContext(gS);
  if (o === void 0 && !n)
    throw new Error(At(72));
  return o;
}
const iA = {
  ...lu,
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
class vg extends Oi {
  constructor(o, a, i = !1) {
    const u = new sa(), f = {
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
    this.state.floatingRootContext.dispatchOpenChange(!1, Ye(ql, o));
  }
  static useStore(o, a) {
    return Wp(o, (u, f) => new vg(a, u, f)).store;
  }
}
function sA() {
  return {
    ...nu(),
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
    actionsRef: g,
    onOpenChange: m,
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
  tg(w, u, i, S), w.useControlledProp("openProp", u), w.useControlledProp("triggerIdProp", x), w.useContextCallback("onOpenChange", m), w.useContextCallback("onOpenChangeComplete", d);
  const A = w.useState("open"), E = !a && A, N = w.useState("activeTriggerId"), M = w.useState("mounted"), D = w.useState("payload");
  w.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), w.useSyncedValue("disabled", a), Wc(w, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: z,
    transitionStatus: I
  } = eu(E, w), j = w.useState("isInstantPhase"), H = w.useState("instantType"), _ = w.useState("lastOpenChangeReason"), k = y.useRef(null);
  xe(() => {
    A && a && w.setOpen(!1, Ye(gR));
  }, [A, a, w]), xe(() => {
    I === "ending" && _ === No || I !== "ending" && j ? (H !== "delay" && (k.current = H), w.set("instantType", "delay")) : k.current !== null && (w.set("instantType", k.current), k.current = null);
  }, [I, j, _, H, w]), xe(() => {
    E && N == null && w.set("payload", void 0);
  }, [w, N, E]);
  const Y = y.useCallback(() => {
    w.setOpen(!1, Ye(Gc));
  }, [w]);
  y.useImperativeHandle(g, () => ({
    unmount: z,
    close: Y
  }), [z, Y]);
  const ne = E || M || !a && p !== "none";
  return /* @__PURE__ */ b.jsxs(gS.Provider, {
    value: w,
    children: [ne && /* @__PURE__ */ b.jsx(uA, {
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
  return tu(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const mS = /* @__PURE__ */ y.createContext(void 0);
function fA() {
  return y.useContext(mS);
}
let dA = (function(n) {
  return n[n.popupOpen = Oc.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
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
    payload: g,
    disabled: m,
    delay: d,
    closeOnClick: v = !0,
    closeDelay: x,
    id: S,
    ...C
  } = o, w = Ni(!0), A = p?.store ?? w;
  if (!A)
    throw new Error(At(82));
  const E = Bn(S), N = A.useState("isTriggerActive", E), M = A.useState("isOpenedByTrigger", E), D = A.useState("floatingRootContext"), z = y.useRef(null), I = d ?? pA, j = x ?? 0, {
    registerTrigger: H,
    isMountedByThisTrigger: _
  } = ng(E, z, A, {
    payload: g,
    closeOnClick: v,
    closeDelay: j
  }), k = fA(), {
    delayRef: Y,
    isInstantPhase: ne,
    hasProvider: X
  } = vR(D, {
    open: M
  }), Z = ag(D);
  A.useSyncedValue("isInstantPhase", ne);
  const Q = A.useState("disabled"), q = m ?? Q, R = Yt(q), B = A.useState("trackCursorAxis"), P = A.useState("disableHoverablePopup"), F = y.useRef(!1), L = sn(), O = y.useRef(void 0);
  function U() {
    const fe = k?.delay, ye = typeof Y.current == "object" ? Y.current.open : void 0;
    let Re = I;
    return X && (ye !== 0 ? Re = d ?? fe ?? I : Re = 0), Re;
  }
  function te(fe) {
    const ye = z.current;
    if (!ye || !fe)
      return !1;
    const Re = gA(fe);
    return Re !== null && Re !== ye && Le(ye, Re);
  }
  function J(fe) {
    const ye = te(fe);
    return F.current = ye, ye && (Z.openChangeTimeout.clear(), Z.restTimeout.clear(), Z.restTimeoutPending = !1, L.clear()), ye;
  }
  const re = ou(D, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !P && B !== "both" ? au() : null,
    restMs: U,
    delay() {
      const fe = typeof Y.current == "object" ? Y.current.close : void 0;
      let ye = j;
      return x == null && X && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: z,
    isActiveTrigger: N,
    isClosing: () => A.select("transitionStatus") === "ending",
    shouldOpen() {
      return !F.current;
    }
  }), ie = ox(D, {
    enabled: !q
  }).reference, oe = (fe) => {
    const ye = F.current, Re = Ob(fe), _e = J(Re), ke = z.current, we = ke && Re && Le(ke, Re);
    if (_e && A.select("open") && A.select("lastOpenChangeReason") === Pt) {
      A.setOpen(!1, Ye(Pt, fe));
      return;
    }
    if (ye && !_e && we && !R.current && !A.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    or(O.current)) {
      const Ce = () => {
        !F.current && !R.current && !A.select("open") && A.setOpen(!0, Ye(Pt, fe, ke));
      }, he = U();
      he === 0 ? (L.clear(), Ce()) : L.start(he, Ce);
    }
  }, se = A.useState("triggerProps", _);
  return nt("button", o, {
    state: {
      open: M
    },
    ref: [a, H, z],
    props: [re, ie, _ || B !== "none" ? se : void 0, {
      onMouseOver(fe) {
        oe(fe.nativeEvent);
      },
      onFocus(fe) {
        te(Ob(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        F.current = !1, L.clear(), O.current = void 0;
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
      id: E,
      [dA.triggerDisabled]: q ? "" : void 0,
      [hS]: q ? void 0 : ""
    }, C],
    stateAttributesMapping: iu
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
    style: g,
    ...m
  } = o, {
    portalNode: d,
    portalSubtree: v
  } = k0({
    container: u,
    ref: a,
    componentProps: o,
    elementProps: m
  });
  return !v && !d ? null : /* @__PURE__ */ b.jsxs(y.Fragment, {
    children: [v, d && /* @__PURE__ */ gl.createPortal(i, d)]
  });
}), vA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...u
  } = o;
  return Ni().useState("mounted") || i ? /* @__PURE__ */ b.jsx(yS.Provider, {
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
    side: g = "top",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: S = 5,
    arrowPadding: C = 5,
    sticky: w = !1,
    disableAnchorTracking: A = !1,
    collisionAvoidance: E = Xp,
    style: N,
    ...M
  } = o, D = Ni(), z = hA(), I = D.useState("open"), j = D.useState("mounted"), H = D.useState("trackCursorAxis"), _ = D.useState("disableHoverablePopup"), k = D.useState("floatingRootContext"), Y = D.useState("instantType"), ne = D.useState("transitionStatus"), X = D.useState("hasViewport"), Z = hu({
    anchor: f,
    positionMethod: p,
    floatingRootContext: k,
    mounted: j,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    collisionBoundary: x,
    collisionPadding: S,
    sticky: w,
    arrowPadding: C,
    disableAnchorTracking: A,
    keepMounted: z,
    collisionAvoidance: E,
    adaptiveOrigin: X ? ug : void 0
  }), Q = y.useMemo(() => ({
    open: I,
    side: Z.side,
    align: Z.align,
    anchorHidden: Z.anchorHidden,
    instant: H !== "none" ? "tracking-cursor" : Y
  }), [I, Z.side, Z.align, Z.anchorHidden, H, Y]), q = yu(o, Q, {
    styles: Z.positionerStyles,
    transitionStatus: ne,
    props: M,
    refs: [a, D.useStateSetter("positionerElement")],
    hidden: !j,
    inert: !I || H === "both" || _
  });
  return /* @__PURE__ */ b.jsx(vS.Provider, {
    value: Z,
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
  } = o, g = Ni(), {
    side: m,
    align: d
  } = bS(), v = g.useState("open"), x = g.useState("instantType"), S = g.useState("transitionStatus"), C = g.useState("popupProps"), w = g.useState("floatingRootContext"), A = g.useState("disabled"), E = g.useState("closeDelay");
  Ql({
    open: v,
    ref: g.context.popupRef,
    onComplete() {
      v && g.context.onOpenChangeComplete?.(!0);
    }
  }), ig(w, {
    enabled: !A,
    closeDelay: E
  });
  const N = g.useStateSetter("popupElement");
  return nt("div", o, {
    state: {
      open: v,
      side: m,
      align: d,
      instant: x,
      transitionStatus: S
    },
    ref: [a, g.context.popupRef, N],
    props: [C, zi(S), p],
    stateAttributesMapping: xA
  });
}), wA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: u,
    style: f,
    ...p
  } = o, g = Ni(), {
    arrowRef: m,
    side: d,
    align: v,
    arrowUncentered: x,
    arrowStyles: S
  } = bS(), C = g.useState("open"), w = g.useState("instantType");
  return nt("div", o, {
    state: {
      open: C,
      side: d,
      align: v,
      uncentered: x,
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
function nr(n) {
  const { label: o, children: a, placement: i = "top", contentClassName: u } = n, f = np.useId(), [p, g] = np.useState(!1);
  return /* @__PURE__ */ b.jsxs(RA, { open: p, onOpenChange: g, children: [
    /* @__PURE__ */ b.jsx(
      CA,
      {
        delay: xS,
        closeDelay: 0,
        "aria-describedby": p ? f : void 0,
        onBlur: () => g(!1),
        onMouseLeave: () => g(!1),
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
function cc(n, o) {
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
  const [i, u] = y.useState(""), [f, p] = y.useState(!1), [g, m] = y.useState(!1), [d, v] = y.useState(""), [x, S] = y.useState(!1), [C, w] = y.useState(!1), A = window.__galleryFileTypes, E = n.types.filter((k) => k.active).map((k) => k.key), N = n.pinned.map((k) => n.types.find((Y) => Y.key === k)).filter((k) => !!k), M = N.filter((k) => Mb.has(k.key)), D = N.filter((k) => !Mb.has(k.key)), z = n.types.filter((k) => {
    const Y = i.trim().toLowerCase();
    return !Y || k.key.includes(Y) || k.label.toLowerCase().includes(Y);
  }), I = SS("folder").map((k) => ({
    value: k.value,
    label: k.value ? k.label : "All folders"
  })), j = (k, Y) => {
    const ne = new Set(k);
    A?.setActive([...E.filter((X) => !ne.has(X)), ...Y]);
  }, H = () => {
    const k = d.trim();
    k && (A?.savePreset(k), v(""), m(!1));
  };
  if (f)
    return /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
      /* @__PURE__ */ b.jsxs(i2, { className: "gallery-filter-panel-head", children: [
        /* @__PURE__ */ b.jsx(jc, { className: "tw:sr-only", children: "File types" }),
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
      /* @__PURE__ */ b.jsx(gc, {}),
      /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-scroll", children: /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-section", children: [
        /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-section-label", children: "Choose pinned types" }),
        /* @__PURE__ */ b.jsx(
          Rb,
          {
            multiple: !0,
            value: n.pinned,
            onValueChange: (k) => A?.setPinned(k),
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
    const ne = Y.map((X) => X.key);
    return /* @__PURE__ */ b.jsxs("div", { className: "gallery-type-group", children: [
      /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-sub-label", children: k }),
      /* @__PURE__ */ b.jsx(
        Rb,
        {
          multiple: !0,
          value: E.filter((X) => ne.includes(X)),
          onValueChange: (X) => j(ne, X),
          className: "gallery-quick-types",
          "aria-label": `${k.toLowerCase()} file types`,
          children: Y.map((X) => /* @__PURE__ */ b.jsx(
            Cb,
            {
              value: X.key,
              variant: "outline",
              size: "xs",
              "data-gallery-quick-type": X.key,
              "data-gallery-active": X.active ? "true" : void 0,
              children: X.label
            },
            X.key
          ))
        }
      )
    ] });
  };
  return /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
    /* @__PURE__ */ b.jsx(jc, { className: "tw:sr-only", children: "File types" }),
    /* @__PURE__ */ b.jsx(xp, { className: "tw:sr-only", children: "Filter files and customize quick file types for this project" }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-scroll", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ b.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "quick-types-heading", children: [
        /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-section-heading", children: [
          /* @__PURE__ */ b.jsxs("div", { children: [
            /* @__PURE__ */ b.jsx("div", { id: "quick-types-heading", className: "gallery-filter-section-label", children: "Quick Types" }),
            /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-helper", children: "Pinned for this project" })
          ] }),
          /* @__PURE__ */ b.jsx(nr, { label: "Customize quick types", children: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-xs", "aria-label": "Customize quick types", onClick: () => p(!0), children: /* @__PURE__ */ b.jsx(jb, {}) }) })
        ] }),
        _("Outputs", M),
        _("Sources", D)
      ] }),
      /* @__PURE__ */ b.jsx(gc, {}),
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
                onClick: () => A?.applyPreset(k.id),
                children: k.label
              }
            ),
            k.custom && /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: "ghost",
                size: "icon-xs",
                "aria-label": `Delete preset ${k.label}`,
                onClick: () => A?.removePreset(k.id),
                children: /* @__PURE__ */ b.jsx(ui, {})
              }
            )
          ] }, k.id)),
          /* @__PURE__ */ b.jsx(nr, { label: "New preset", children: /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "icon-xs", "data-gallery-new-preset": !0, "aria-label": "New preset", onClick: () => m(!0), children: /* @__PURE__ */ b.jsx(Db, {}) }) })
        ] }),
        g && /* @__PURE__ */ b.jsxs(Nc, { "data-gallery-preset-form": !0, children: [
          /* @__PURE__ */ b.jsx(
            Dc,
            {
              "aria-label": "New preset name",
              placeholder: "Preset name…",
              value: d,
              onChange: (k) => v(k.target.value),
              onKeyDown: (k) => {
                k.key === "Enter" && (k.preventDefault(), H()), k.key === "Escape" && (k.stopPropagation(), m(!1));
              },
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ b.jsx(mi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { onClick: H, disabled: !d.trim(), children: "Save" }) })
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
              x ? /* @__PURE__ */ b.jsx(mc, { "data-icon": "inline-end" }) : /* @__PURE__ */ b.jsx(lp, { "data-icon": "inline-end" })
            ]
          }
        ),
        x && /* @__PURE__ */ b.jsxs("div", { className: "gallery-filter-collapsible-content", children: [
          /* @__PURE__ */ b.jsxs(Nc, { children: [
            /* @__PURE__ */ b.jsx(
              Dc,
              {
                "aria-label": "Search file types",
                placeholder: "Search extension or language…",
                value: i,
                onChange: (k) => u(k.target.value)
              }
            ),
            /* @__PURE__ */ b.jsx(mi, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(op, {}) })
          ] }),
          /* @__PURE__ */ b.jsx("div", { className: "gallery-all-types", role: "list", "aria-label": "All file types", children: z.map((k) => /* @__PURE__ */ b.jsxs("div", { className: "gallery-all-type-row", role: "listitem", children: [
            /* @__PURE__ */ b.jsxs(
              ct,
              {
                variant: "ghost",
                size: "sm",
                "data-gallery-file-type": k.key,
                "aria-pressed": k.active,
                onClick: () => j([k.key], k.active ? [] : [k.key]),
                children: [
                  k.active && /* @__PURE__ */ b.jsx(yi, { "data-icon": "inline-start" }),
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
                onClick: () => A?.setPinned(k.pinned ? n.pinned.filter((Y) => Y !== k.key) : [...n.pinned, k.key]),
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
              C ? /* @__PURE__ */ b.jsx(mc, { "data-icon": "inline-end" }) : /* @__PURE__ */ b.jsx(lp, { "data-icon": "inline-end" })
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
    /* @__PURE__ */ b.jsx(gc, {}),
    /* @__PURE__ */ b.jsx("div", { className: "gallery-filter-panel-foot", children: /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", onClick: () => A?.resetFilters(), children: [
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
  const [, n] = y.useReducer((R) => R + 1, 0), o = y.useRef(null), [a, i] = y.useState(!1), [u, f] = y.useState(!1), [p, g] = y.useState(!1), [m, d] = y.useState(""), v = dt("q")?.value ?? "", x = dt("sort"), S = dt("folder"), C = dt("favChip"), w = dt("rescan")?.classList.contains("spinning") === !0, A = dt("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", E = cc("collMenu", "[data-pick]"), N = cc("wfMenu", "[data-wfpick]"), M = cc("recMenu", "[data-rec]"), D = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: cc("fmtMenu", "input[data-fmt]").map((R) => ({
      key: R.key,
      label: Tp(R.label),
      active: R.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, z = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, I = DA(D), j = document.querySelectorAll("#activeChips [data-fx]:not([data-fx='fav'])").length, H = C?.classList.contains("on") === !0, _ = SS("sort").map((R) => ({ value: R.value, label: tp(R.value) })), k = x?.value ?? "mtime", Y = NA[k], ne = N.some((R) => R.active && R.key !== ""), X = E.some((R) => R.active), Z = () => dt("collMenu")?.querySelector("[data-clear]")?.click(), Q = () => {
    const R = m.trim();
    if (!R) return;
    const B = dt("collQuick"), P = dt("collQuickAdd");
    B && P && (B.value = R, P.click()), d("");
  };
  y.useEffect(() => {
    const R = () => n(), B = new MutationObserver(R);
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
    ].filter((L) => !!L).forEach((L) => B.observe(L, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const F = [dt("q"), dt("sort"), dt("folder")].filter((L) => !!L);
    return F.forEach((L) => {
      L.addEventListener("input", R), L.addEventListener("change", R);
    }), window.addEventListener("atelier-gallery-file-types-change", R), window.addEventListener("atelier-gallery-selection-change", R), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      B.disconnect(), F.forEach((L) => {
        L.removeEventListener("input", R), L.removeEventListener("change", R);
      }), window.removeEventListener("atelier-gallery-file-types-change", R), window.removeEventListener("atelier-gallery-selection-change", R), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), y.useEffect(() => {
    z.rels.length && (i(!1), f(!1));
  }, [z.rels.length]), y.useEffect(() => {
    if (!u) return;
    const R = (B) => {
      B.key === "Escape" && (B.preventDefault(), B.stopPropagation(), f(!1), requestAnimationFrame(() => o.current?.focus()));
    };
    return window.addEventListener("keydown", R, !0), () => window.removeEventListener("keydown", R, !0);
  }, [u]), y.useEffect(() => {
    const R = (B) => {
      const P = B.target, F = P?.matches("input, textarea, select") || P?.isContentEditable;
      B.key !== "/" || B.metaKey || B.ctrlKey || B.altKey || F || (B.preventDefault(), f(!1), i(!0));
    };
    return document.addEventListener("keydown", R), () => document.removeEventListener("keydown", R);
  }, []);
  const q = (R) => {
    const B = dt("q");
    B && (B.value = R, B.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (z.rels.length) {
    const R = window.__gallerySelection;
    return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ b.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ b.jsx(EE, { "aria-hidden": "true" }),
        /* @__PURE__ */ b.jsxs("span", { children: [
          z.rels.length,
          " selected"
        ] })
      ] }),
      /* @__PURE__ */ b.jsx("div", { className: "gallery-command-spacer" }),
      z.rels.length === 1 && /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => R?.open(), children: "Open" }),
      z.imageCount >= 2 && /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => R?.compare(), children: "Compare" }),
      /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (B) => {
        B.stopPropagation(), R?.collect(B.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ b.jsxs(ct, { variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (B) => {
        B.stopPropagation(), R?.export(B.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ b.jsx(mc, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ b.jsxs(lc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(oc, { render: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ b.jsx(xv, {}) }) }),
        /* @__PURE__ */ b.jsxs(ai, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ b.jsx(wo, { children: /* @__PURE__ */ b.jsx(Qr, { onClick: () => R?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ b.jsx(Jd, {}),
          /* @__PURE__ */ b.jsx(wo, { children: /* @__PURE__ */ b.jsxs(Qr, { variant: "destructive", onClick: () => R?.delete(), children: [
            /* @__PURE__ */ b.jsx(kb, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ b.jsx(nr, { label: "Clear selection (Esc)", children: /* @__PURE__ */ b.jsx(ct, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => R?.clear(), children: /* @__PURE__ */ b.jsx(ui, {}) }) })
    ] });
  }
  return /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", role: "group", "aria-label": "Search and filter gallery", children: [
      /* @__PURE__ */ b.jsxs($d, { open: a, onOpenChange: (R) => {
        i(R), R && f(!1);
      }, children: [
        /* @__PURE__ */ b.jsx(nr, { label: v ? "Edit search" : "Search files (/)", children: /* @__PURE__ */ b.jsx(
          Wd,
          {
            render: /* @__PURE__ */ b.jsx(
              ct,
              {
                variant: v ? "secondary" : "outline",
                size: "icon-sm",
                "aria-label": v ? `Search files: ${v}` : "Search files",
                "aria-pressed": a,
                children: /* @__PURE__ */ b.jsx(op, {})
              }
            )
          }
        ) }),
        /* @__PURE__ */ b.jsxs(ep, { align: "start", sideOffset: 6, className: "gallery-search-popover tw:gap-0 tw:p-2", children: [
          /* @__PURE__ */ b.jsx(jc, { className: "tw:sr-only", children: "Search project files" }),
          /* @__PURE__ */ b.jsx(xp, { className: "tw:sr-only", children: "Search by file name or folder" }),
          /* @__PURE__ */ b.jsxs(Nc, { "data-gallery-command-group": "search", children: [
            /* @__PURE__ */ b.jsx(
              Dc,
              {
                "aria-label": "Search project files",
                "data-gallery-command": "search",
                placeholder: "Search by name or folder…",
                value: v,
                onChange: (R) => q(R.target.value),
                autoFocus: !0
              }
            ),
            /* @__PURE__ */ b.jsx(mi, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ b.jsx(op, {}) }),
            v && /* @__PURE__ */ b.jsx(mi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { size: "icon-xs", "aria-label": "Clear search", onClick: () => q(""), children: /* @__PURE__ */ b.jsx(ui, {}) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs($d, { open: u, onOpenChange: (R) => {
        f(R), R && i(!1);
      }, children: [
        /* @__PURE__ */ b.jsx(
          Wd,
          {
            render: /* @__PURE__ */ b.jsxs(
              ct,
              {
                ref: o,
                variant: j ? "secondary" : "outline",
                size: "sm",
                "data-gallery-command": "filters",
                "aria-label": j ? `Filters, ${j} active` : "Filters",
                children: [
                  /* @__PURE__ */ b.jsx(iE, { "data-icon": "inline-start" }),
                  /* @__PURE__ */ b.jsxs("span", { className: "gallery-filter-label", children: [
                    "Filters",
                    j ? ` ${j}` : ""
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
                state: D,
                folder: S,
                collectionItems: E
              }
            )
          }
        )
      ] }),
      /* @__PURE__ */ b.jsxs(
        ct,
        {
          variant: H ? "secondary" : "outline",
          size: "sm",
          "data-gallery-command": "favorites",
          "aria-label": "Favorites",
          "aria-pressed": H,
          onClick: () => Zr("favChip"),
          children: [
            /* @__PURE__ */ b.jsx(rp, { "data-icon": "inline-start", fill: H ? "currentColor" : "none" }),
            /* @__PURE__ */ b.jsx("span", { className: "gallery-fav-label", children: "Favorites" })
          ]
        }
      ),
      /* @__PURE__ */ b.jsxs($d, { open: p, onOpenChange: g, children: [
        /* @__PURE__ */ b.jsx(Wd, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "outline", size: "sm", "data-gallery-command": "collection", "data-gallery-active": X ? "true" : void 0, "aria-label": "Collections", children: [
          /* @__PURE__ */ b.jsx(uE, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-collection-label", children: "Collection" })
        ] }) }),
        /* @__PURE__ */ b.jsxs(ep, { align: "start", className: "tw:flex tw:flex-col tw:gap-1 tw:w-56 tw:p-1", children: [
          /* @__PURE__ */ b.jsx(jc, { className: "tw:sr-only", children: "Collections" }),
          /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", className: "tw:w-full tw:justify-start", onClick: () => {
            Z(), g(!1);
          }, children: [
            /* @__PURE__ */ b.jsx(yi, { "data-icon": "inline-start", className: X ? "tw:opacity-0" : "" }),
            "All collections"
          ] }),
          E.map((R) => /* @__PURE__ */ b.jsxs(ct, { variant: "ghost", size: "sm", className: "tw:w-full tw:justify-start", onClick: () => {
            R.element.click(), g(!1);
          }, children: [
            /* @__PURE__ */ b.jsx(yi, { "data-icon": "inline-start", className: R.active ? "" : "tw:opacity-0" }),
            Tp(R.label)
          ] }, R.key)),
          /* @__PURE__ */ b.jsx(gc, { className: "tw:my-1" }),
          /* @__PURE__ */ b.jsxs(Nc, { children: [
            /* @__PURE__ */ b.jsx(
              Dc,
              {
                value: m,
                onChange: (R) => d(R.target.value),
                onKeyDown: (R) => {
                  R.key === "Enter" && (R.preventDefault(), Q());
                },
                placeholder: "New collection…",
                "aria-label": "New collection name"
              }
            ),
            /* @__PURE__ */ b.jsx(mi, { align: "inline-end", children: /* @__PURE__ */ b.jsx(bp, { size: "icon-xs", "aria-label": "Create collection", disabled: !m.trim(), onClick: Q, children: /* @__PURE__ */ b.jsx(Db, {}) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ b.jsxs(lc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(oc, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "outline", size: "sm", "data-gallery-command": "status", "data-gallery-active": ne ? "true" : void 0, "aria-label": "Filter by status", children: [
          /* @__PURE__ */ b.jsx(lE, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-status-label", children: "Status" })
        ] }) }),
        /* @__PURE__ */ b.jsx(ai, { align: "start", className: "tw:w-48", children: /* @__PURE__ */ b.jsx(wo, { children: N.map((R) => /* @__PURE__ */ b.jsx(
          vb,
          {
            checked: R.active,
            "data-gallery-status": R.key,
            onClick: () => R.element.click(),
            children: R.label
          },
          R.key || "all"
        )) }) })
      ] })
    ] }),
    /* @__PURE__ */ b.jsxs("div", { className: "gallery-command-group", role: "group", "aria-label": "Sort and display gallery", children: [
      /* @__PURE__ */ b.jsxs(iS, { items: _, modal: !1, value: x?.value ?? "mtime", onValueChange: (R) => R && Ep("sort", R), children: [
        /* @__PURE__ */ b.jsx(
          uS,
          {
            size: "sm",
            className: "gallery-command-select gallery-command-sort",
            "aria-label": `Sort project files: ${tp(x?.value ?? "mtime")}`,
            children: /* @__PURE__ */ b.jsx(cS, { children: (R) => tp(String(R)) })
          }
        ),
        /* @__PURE__ */ b.jsx(fS, { children: /* @__PURE__ */ b.jsx(sS, { children: _.map((R) => /* @__PURE__ */ b.jsx(dS, { value: R.value, children: R.label }, R.value)) }) })
      ] }),
      /* @__PURE__ */ b.jsx(nr, { label: Y ? "Reverse sort direction" : "No reverse for this sort", children: /* @__PURE__ */ b.jsx(
        ct,
        {
          variant: "outline",
          size: "icon-sm",
          "data-gallery-command": "sort-dir",
          "aria-label": "Reverse sort direction",
          disabled: !Y,
          onClick: () => Y && Ep("sort", Y),
          children: /* @__PURE__ */ b.jsx(J1, {})
        }
      ) }),
      /* @__PURE__ */ b.jsxs(lc, { modal: !1, children: [
        /* @__PURE__ */ b.jsx(oc, { render: /* @__PURE__ */ b.jsxs(ct, { variant: "outline", size: "sm", "aria-label": "View options", children: [
          /* @__PURE__ */ b.jsx(Sv, { "data-icon": "inline-start" }),
          /* @__PURE__ */ b.jsx("span", { className: "gallery-view-label", children: "View" })
        ] }) }),
        /* @__PURE__ */ b.jsx(ai, { align: "end", className: "tw:w-44", children: /* @__PURE__ */ b.jsxs(wo, { children: [
          /* @__PURE__ */ b.jsx(AM, { children: "Card size" }),
          [{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((R) => /* @__PURE__ */ b.jsx(
            vb,
            {
              checked: A === R.key,
              "data-gallery-density": R.key,
              onClick: () => dt("densitySeg")?.querySelector(`[data-d="${R.key}"]`)?.click(),
              children: R.label
            },
            R.key
          ))
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ b.jsx(nr, { label: w ? "Rescanning…" : "Rescan project", children: /* @__PURE__ */ b.jsx(
      ct,
      {
        variant: "outline",
        size: "icon-sm",
        "data-gallery-command": "rescan",
        "aria-label": "Rescan project",
        disabled: w,
        onClick: () => Zr("rescan"),
        children: w ? /* @__PURE__ */ b.jsx(aA, {}) : /* @__PURE__ */ b.jsx(yE, {})
      }
    ) }),
    /* @__PURE__ */ b.jsxs(lc, { modal: !1, children: [
      /* @__PURE__ */ b.jsx(nr, { label: "Gallery tools", children: /* @__PURE__ */ b.jsx(oc, { render: /* @__PURE__ */ b.jsx(ct, { variant: "outline", size: "icon-sm", "aria-label": "Gallery tools", children: /* @__PURE__ */ b.jsx(xv, {}) }) }) }),
      /* @__PURE__ */ b.jsxs(ai, { align: "end", className: "tw:w-48", children: [
        /* @__PURE__ */ b.jsx(wo, { children: /* @__PURE__ */ b.jsxs(Qr, { onClick: () => Zr("viewChip"), children: [
          /* @__PURE__ */ b.jsx(jb, { "data-icon": "inline-start" }),
          " Gallery settings…"
        ] }) }),
        /* @__PURE__ */ b.jsx(Jd, {}),
        /* @__PURE__ */ b.jsxs(wo, { children: [
          /* @__PURE__ */ b.jsxs(Qr, { onClick: () => Zr("boardChip"), children: [
            /* @__PURE__ */ b.jsx(Sv, { "data-icon": "inline-start" }),
            " Board"
          ] }),
          /* @__PURE__ */ b.jsxs(Qr, { onClick: () => Zr("notesChip"), children: [
            /* @__PURE__ */ b.jsx(gE, { "data-icon": "inline-start" }),
            " Notes"
          ] })
        ] }),
        M.length > 0 && /* @__PURE__ */ b.jsxs(b.Fragment, { children: [
          /* @__PURE__ */ b.jsx(Jd, {}),
          /* @__PURE__ */ b.jsx(wo, { children: /* @__PURE__ */ b.jsxs(zM, { children: [
            /* @__PURE__ */ b.jsx(NM, { children: "Recent files" }),
            /* @__PURE__ */ b.jsx(DM, { children: /* @__PURE__ */ b.jsx(wo, { children: M.map((R) => /* @__PURE__ */ b.jsx(Qr, { onClick: () => R.element.click(), children: R.label }, R.key)) }) })
          ] }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ b.jsx("div", { className: "gallery-active-filters", "aria-label": "Active filters", children: I.map((R) => /* @__PURE__ */ b.jsxs(
      ct,
      {
        variant: "outline",
        size: "xs",
        className: "gallery-filter-chip",
        "data-gallery-filter-chip": R.key,
        "aria-label": `Remove filter ${R.label}`,
        onClick: () => R.remove.click(),
        children: [
          R.label,
          /* @__PURE__ */ b.jsx(ui, { "data-icon": "inline-end" })
        ]
      },
      R.key
    )) })
  ] });
}
function HA() {
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
  const [n, o] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [u, f] = y.useState(dt("inspTitle")?.textContent || "Inspector"), p = y.useRef(dt("inspector")), g = y.useCallback((m) => {
    const d = dt("inspBody");
    d && m && m.appendChild(d);
  }, []);
  return y.useLayoutEffect(() => () => {
    const m = dt("inspBody");
    m && p.current && p.current.appendChild(m);
  }, []), y.useEffect(() => {
    const m = () => {
      const x = document.documentElement.classList.contains("emb");
      o(!x && document.body.classList.contains("has-insp")), f(dt("inspTitle")?.textContent || "Inspector");
    }, d = new MutationObserver(m);
    d.observe(document.body, { attributes: !0, attributeFilter: ["class"] });
    const v = dt("inspTitle");
    return v && d.observe(v, { childList: !0, characterData: !0, subtree: !0 }), m(), () => d.disconnect();
  }, []), y.useEffect(() => {
    const m = window.matchMedia("(max-width: 800px)"), d = () => i(m.matches);
    return m.addEventListener("change", d), d(), () => m.removeEventListener("change", d);
  }, []), /* @__PURE__ */ b.jsx(
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
            /* @__PURE__ */ b.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
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
