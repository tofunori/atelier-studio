function C1(n, o) {
  for (var a = 0; a < o.length; a++) {
    const i = o[a];
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
function O1(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var xd = { exports: {} }, Wa = {};
var ev;
function M1() {
  if (ev) return Wa;
  ev = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.fragment");
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
  return Wa.Fragment = o, Wa.jsx = a, Wa.jsxs = a, Wa;
}
var tv;
function A1() {
  return tv || (tv = 1, xd.exports = M1()), xd.exports;
}
var S = A1(), Sd = { exports: {} }, Ge = {};
var nv;
function z1() {
  if (nv) return Ge;
  nv = 1;
  var n = /* @__PURE__ */ Symbol.for("react.transitional.element"), o = /* @__PURE__ */ Symbol.for("react.portal"), a = /* @__PURE__ */ Symbol.for("react.fragment"), i = /* @__PURE__ */ Symbol.for("react.strict_mode"), c = /* @__PURE__ */ Symbol.for("react.profiler"), f = /* @__PURE__ */ Symbol.for("react.consumer"), p = /* @__PURE__ */ Symbol.for("react.context"), g = /* @__PURE__ */ Symbol.for("react.forward_ref"), m = /* @__PURE__ */ Symbol.for("react.suspense"), d = /* @__PURE__ */ Symbol.for("react.memo"), v = /* @__PURE__ */ Symbol.for("react.lazy"), b = /* @__PURE__ */ Symbol.for("react.activity"), x = Symbol.iterator;
  function R(M) {
    return M === null || typeof M != "object" ? null : (M = x && M[x] || M["@@iterator"], typeof M == "function" ? M : null);
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
  }, D = Object.assign, T = {};
  function N(M, H, te) {
    this.props = M, this.context = H, this.refs = T, this.updater = te || w;
  }
  N.prototype.isReactComponent = {}, N.prototype.setState = function(M, H) {
    if (typeof M != "object" && typeof M != "function" && M != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, M, H, "setState");
  }, N.prototype.forceUpdate = function(M) {
    this.updater.enqueueForceUpdate(this, M, "forceUpdate");
  };
  function A() {
  }
  A.prototype = N.prototype;
  function E(M, H, te) {
    this.props = M, this.context = H, this.refs = T, this.updater = te || w;
  }
  var z = E.prototype = new A();
  z.constructor = E, D(z, N.prototype), z.isPureReactComponent = !0;
  var U = Array.isArray;
  function j() {
  }
  var O = { H: null, A: null, T: null, S: null }, k = Object.prototype.hasOwnProperty;
  function G(M, H, te) {
    var J = te.ref;
    return {
      $$typeof: n,
      type: M,
      key: H,
      ref: J !== void 0 ? J : null,
      props: te
    };
  }
  function P(M, H) {
    return G(M.type, H, M.props);
  }
  function ne(M) {
    return typeof M == "object" && M !== null && M.$$typeof === n;
  }
  function K(M) {
    var H = { "=": "=0", ":": "=2" };
    return "$" + M.replace(/[=:]/g, function(te) {
      return H[te];
    });
  }
  var Q = /\/+/g;
  function Z(M, H) {
    return typeof M == "object" && M !== null && M.key != null ? K("" + M.key) : H.toString(36);
  }
  function q(M) {
    switch (M.status) {
      case "fulfilled":
        return M.value;
      case "rejected":
        throw M.reason;
      default:
        switch (typeof M.status == "string" ? M.then(j, j) : (M.status = "pending", M.then(
          function(H) {
            M.status === "pending" && (M.status = "fulfilled", M.value = H);
          },
          function(H) {
            M.status === "pending" && (M.status = "rejected", M.reason = H);
          }
        )), M.status) {
          case "fulfilled":
            return M.value;
          case "rejected":
            throw M.reason;
        }
    }
    throw M;
  }
  function _(M, H, te, J, re) {
    var ie = typeof M;
    (ie === "undefined" || ie === "boolean") && (M = null);
    var oe = !1;
    if (M === null) oe = !0;
    else
      switch (ie) {
        case "bigint":
        case "string":
        case "number":
          oe = !0;
          break;
        case "object":
          switch (M.$$typeof) {
            case n:
            case o:
              oe = !0;
              break;
            case v:
              return oe = M._init, _(
                oe(M._payload),
                H,
                te,
                J,
                re
              );
          }
      }
    if (oe)
      return re = re(M), oe = J === "" ? "." + Z(M, 0) : J, U(re) ? (te = "", oe != null && (te = oe.replace(Q, "$&/") + "/"), _(re, H, te, "", function(je) {
        return je;
      })) : re != null && (ne(re) && (re = P(
        re,
        te + (re.key == null || M && M.key === re.key ? "" : ("" + re.key).replace(
          Q,
          "$&/"
        ) + "/") + oe
      )), H.push(re)), 1;
    oe = 0;
    var se = J === "" ? "." : J + ":";
    if (U(M))
      for (var ge = 0; ge < M.length; ge++)
        J = M[ge], ie = se + Z(J, ge), oe += _(
          J,
          H,
          te,
          ie,
          re
        );
    else if (ge = R(M), typeof ge == "function")
      for (M = ge.call(M), ge = 0; !(J = M.next()).done; )
        J = J.value, ie = se + Z(J, ge++), oe += _(
          J,
          H,
          te,
          ie,
          re
        );
    else if (ie === "object") {
      if (typeof M.then == "function")
        return _(
          q(M),
          H,
          te,
          J,
          re
        );
      throw H = String(M), Error(
        "Objects are not valid as a React child (found: " + (H === "[object Object]" ? "object with keys {" + Object.keys(M).join(", ") + "}" : H) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return oe;
  }
  function Y(M, H, te) {
    if (M == null) return M;
    var J = [], re = 0;
    return _(M, J, "", "", function(ie) {
      return H.call(te, ie, re++);
    }), J;
  }
  function B(M) {
    if (M._status === -1) {
      var H = M._result;
      H = H(), H.then(
        function(te) {
          (M._status === 0 || M._status === -1) && (M._status = 1, M._result = te);
        },
        function(te) {
          (M._status === 0 || M._status === -1) && (M._status = 2, M._result = te);
        }
      ), M._status === -1 && (M._status = 0, M._result = H);
    }
    if (M._status === 1) return M._result.default;
    throw M._result;
  }
  var F = typeof reportError == "function" ? reportError : function(M) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var H = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof M == "object" && M !== null && typeof M.message == "string" ? String(M.message) : String(M),
        error: M
      });
      if (!window.dispatchEvent(H)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", M);
      return;
    }
    console.error(M);
  }, I = {
    map: Y,
    forEach: function(M, H, te) {
      Y(
        M,
        function() {
          H.apply(this, arguments);
        },
        te
      );
    },
    count: function(M) {
      var H = 0;
      return Y(M, function() {
        H++;
      }), H;
    },
    toArray: function(M) {
      return Y(M, function(H) {
        return H;
      }) || [];
    },
    only: function(M) {
      if (!ne(M))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return M;
    }
  };
  return Ge.Activity = b, Ge.Children = I, Ge.Component = N, Ge.Fragment = a, Ge.Profiler = c, Ge.PureComponent = E, Ge.StrictMode = i, Ge.Suspense = m, Ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = O, Ge.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(M) {
      return O.H.useMemoCache(M);
    }
  }, Ge.cache = function(M) {
    return function() {
      return M.apply(null, arguments);
    };
  }, Ge.cacheSignal = function() {
    return null;
  }, Ge.cloneElement = function(M, H, te) {
    if (M == null)
      throw Error(
        "The argument must be a React element, but you passed " + M + "."
      );
    var J = D({}, M.props), re = M.key;
    if (H != null)
      for (ie in H.key !== void 0 && (re = "" + H.key), H)
        !k.call(H, ie) || ie === "key" || ie === "__self" || ie === "__source" || ie === "ref" && H.ref === void 0 || (J[ie] = H[ie]);
    var ie = arguments.length - 2;
    if (ie === 1) J.children = te;
    else if (1 < ie) {
      for (var oe = Array(ie), se = 0; se < ie; se++)
        oe[se] = arguments[se + 2];
      J.children = oe;
    }
    return G(M.type, re, J);
  }, Ge.createContext = function(M) {
    return M = {
      $$typeof: p,
      _currentValue: M,
      _currentValue2: M,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, M.Provider = M, M.Consumer = {
      $$typeof: f,
      _context: M
    }, M;
  }, Ge.createElement = function(M, H, te) {
    var J, re = {}, ie = null;
    if (H != null)
      for (J in H.key !== void 0 && (ie = "" + H.key), H)
        k.call(H, J) && J !== "key" && J !== "__self" && J !== "__source" && (re[J] = H[J]);
    var oe = arguments.length - 2;
    if (oe === 1) re.children = te;
    else if (1 < oe) {
      for (var se = Array(oe), ge = 0; ge < oe; ge++)
        se[ge] = arguments[ge + 2];
      re.children = se;
    }
    if (M && M.defaultProps)
      for (J in oe = M.defaultProps, oe)
        re[J] === void 0 && (re[J] = oe[J]);
    return G(M, ie, re);
  }, Ge.createRef = function() {
    return { current: null };
  }, Ge.forwardRef = function(M) {
    return { $$typeof: g, render: M };
  }, Ge.isValidElement = ne, Ge.lazy = function(M) {
    return {
      $$typeof: v,
      _payload: { _status: -1, _result: M },
      _init: B
    };
  }, Ge.memo = function(M, H) {
    return {
      $$typeof: d,
      type: M,
      compare: H === void 0 ? null : H
    };
  }, Ge.startTransition = function(M) {
    var H = O.T, te = {};
    O.T = te;
    try {
      var J = M(), re = O.S;
      re !== null && re(te, J), typeof J == "object" && J !== null && typeof J.then == "function" && J.then(j, F);
    } catch (ie) {
      F(ie);
    } finally {
      H !== null && te.types !== null && (H.types = te.types), O.T = H;
    }
  }, Ge.unstable_useCacheRefresh = function() {
    return O.H.useCacheRefresh();
  }, Ge.use = function(M) {
    return O.H.use(M);
  }, Ge.useActionState = function(M, H, te) {
    return O.H.useActionState(M, H, te);
  }, Ge.useCallback = function(M, H) {
    return O.H.useCallback(M, H);
  }, Ge.useContext = function(M) {
    return O.H.useContext(M);
  }, Ge.useDebugValue = function() {
  }, Ge.useDeferredValue = function(M, H) {
    return O.H.useDeferredValue(M, H);
  }, Ge.useEffect = function(M, H) {
    return O.H.useEffect(M, H);
  }, Ge.useEffectEvent = function(M) {
    return O.H.useEffectEvent(M);
  }, Ge.useId = function() {
    return O.H.useId();
  }, Ge.useImperativeHandle = function(M, H, te) {
    return O.H.useImperativeHandle(M, H, te);
  }, Ge.useInsertionEffect = function(M, H) {
    return O.H.useInsertionEffect(M, H);
  }, Ge.useLayoutEffect = function(M, H) {
    return O.H.useLayoutEffect(M, H);
  }, Ge.useMemo = function(M, H) {
    return O.H.useMemo(M, H);
  }, Ge.useOptimistic = function(M, H) {
    return O.H.useOptimistic(M, H);
  }, Ge.useReducer = function(M, H, te) {
    return O.H.useReducer(M, H, te);
  }, Ge.useRef = function(M) {
    return O.H.useRef(M);
  }, Ge.useState = function(M) {
    return O.H.useState(M);
  }, Ge.useSyncExternalStore = function(M, H, te) {
    return O.H.useSyncExternalStore(
      M,
      H,
      te
    );
  }, Ge.useTransition = function() {
    return O.H.useTransition();
  }, Ge.version = "19.2.7", Ge;
}
var lv;
function xi() {
  return lv || (lv = 1, Sd.exports = z1()), Sd.exports;
}
var y = xi();
const Qd = /* @__PURE__ */ O1(y), D1 = /* @__PURE__ */ C1({
  __proto__: null,
  default: Qd
}, [y]);
var wd = { exports: {} }, ei = {}, Ed = { exports: {} }, Td = {};
var ov;
function N1() {
  return ov || (ov = 1, (function(n) {
    function o(_, Y) {
      var B = _.length;
      _.push(Y);
      e: for (; 0 < B; ) {
        var F = B - 1 >>> 1, I = _[F];
        if (0 < c(I, Y))
          _[F] = Y, _[B] = I, B = F;
        else break e;
      }
    }
    function a(_) {
      return _.length === 0 ? null : _[0];
    }
    function i(_) {
      if (_.length === 0) return null;
      var Y = _[0], B = _.pop();
      if (B !== Y) {
        _[0] = B;
        e: for (var F = 0, I = _.length, M = I >>> 1; F < M; ) {
          var H = 2 * (F + 1) - 1, te = _[H], J = H + 1, re = _[J];
          if (0 > c(te, B))
            J < I && 0 > c(re, te) ? (_[F] = re, _[J] = B, F = J) : (_[F] = te, _[H] = B, F = H);
          else if (J < I && 0 > c(re, B))
            _[F] = re, _[J] = B, F = J;
          else break e;
        }
      }
      return Y;
    }
    function c(_, Y) {
      var B = _.sortIndex - Y.sortIndex;
      return B !== 0 ? B : _.id - Y.id;
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
    var m = [], d = [], v = 1, b = null, x = 3, R = !1, w = !1, D = !1, T = !1, N = typeof setTimeout == "function" ? setTimeout : null, A = typeof clearTimeout == "function" ? clearTimeout : null, E = typeof setImmediate < "u" ? setImmediate : null;
    function z(_) {
      for (var Y = a(d); Y !== null; ) {
        if (Y.callback === null) i(d);
        else if (Y.startTime <= _)
          i(d), Y.sortIndex = Y.expirationTime, o(m, Y);
        else break;
        Y = a(d);
      }
    }
    function U(_) {
      if (D = !1, z(_), !w)
        if (a(m) !== null)
          w = !0, j || (j = !0, K());
        else {
          var Y = a(d);
          Y !== null && q(U, Y.startTime - _);
        }
    }
    var j = !1, O = -1, k = 5, G = -1;
    function P() {
      return T ? !0 : !(n.unstable_now() - G < k);
    }
    function ne() {
      if (T = !1, j) {
        var _ = n.unstable_now();
        G = _;
        var Y = !0;
        try {
          e: {
            w = !1, D && (D = !1, A(O), O = -1), R = !0;
            var B = x;
            try {
              t: {
                for (z(_), b = a(m); b !== null && !(b.expirationTime > _ && P()); ) {
                  var F = b.callback;
                  if (typeof F == "function") {
                    b.callback = null, x = b.priorityLevel;
                    var I = F(
                      b.expirationTime <= _
                    );
                    if (_ = n.unstable_now(), typeof I == "function") {
                      b.callback = I, z(_), Y = !0;
                      break t;
                    }
                    b === a(m) && i(m), z(_);
                  } else i(m);
                  b = a(m);
                }
                if (b !== null) Y = !0;
                else {
                  var M = a(d);
                  M !== null && q(
                    U,
                    M.startTime - _
                  ), Y = !1;
                }
              }
              break e;
            } finally {
              b = null, x = B, R = !1;
            }
            Y = void 0;
          }
        } finally {
          Y ? K() : j = !1;
        }
      }
    }
    var K;
    if (typeof E == "function")
      K = function() {
        E(ne);
      };
    else if (typeof MessageChannel < "u") {
      var Q = new MessageChannel(), Z = Q.port2;
      Q.port1.onmessage = ne, K = function() {
        Z.postMessage(null);
      };
    } else
      K = function() {
        N(ne, 0);
      };
    function q(_, Y) {
      O = N(function() {
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
      return x;
    }, n.unstable_next = function(_) {
      switch (x) {
        case 1:
        case 2:
        case 3:
          var Y = 3;
          break;
        default:
          Y = x;
      }
      var B = x;
      x = Y;
      try {
        return _();
      } finally {
        x = B;
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
      var B = x;
      x = _;
      try {
        return Y();
      } finally {
        x = B;
      }
    }, n.unstable_scheduleCallback = function(_, Y, B) {
      var F = n.unstable_now();
      switch (typeof B == "object" && B !== null ? (B = B.delay, B = typeof B == "number" && 0 < B ? F + B : F) : B = F, _) {
        case 1:
          var I = -1;
          break;
        case 2:
          I = 250;
          break;
        case 5:
          I = 1073741823;
          break;
        case 4:
          I = 1e4;
          break;
        default:
          I = 5e3;
      }
      return I = B + I, _ = {
        id: v++,
        callback: Y,
        priorityLevel: _,
        startTime: B,
        expirationTime: I,
        sortIndex: -1
      }, B > F ? (_.sortIndex = B, o(d, _), a(m) === null && _ === a(d) && (D ? (A(O), O = -1) : D = !0, q(U, B - F))) : (_.sortIndex = I, o(m, _), w || R || (w = !0, j || (j = !0, K()))), _;
    }, n.unstable_shouldYield = P, n.unstable_wrapCallback = function(_) {
      var Y = x;
      return function() {
        var B = x;
        x = Y;
        try {
          return _.apply(this, arguments);
        } finally {
          x = B;
        }
      };
    };
  })(Td)), Td;
}
var rv;
function j1() {
  return rv || (rv = 1, Ed.exports = N1()), Ed.exports;
}
var Rd = { exports: {} }, hn = {};
var av;
function k1() {
  if (av) return hn;
  av = 1;
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
  }, c = /* @__PURE__ */ Symbol.for("react.portal");
  function f(m, d, v) {
    var b = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: c,
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
      var v = d.as, b = g(v, d.crossOrigin), x = typeof d.integrity == "string" ? d.integrity : void 0, R = typeof d.fetchPriority == "string" ? d.fetchPriority : void 0;
      v === "style" ? i.d.S(
        m,
        typeof d.precedence == "string" ? d.precedence : void 0,
        {
          crossOrigin: b,
          integrity: x,
          fetchPriority: R
        }
      ) : v === "script" && i.d.X(m, {
        crossOrigin: b,
        integrity: x,
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
var iv;
function wb() {
  if (iv) return Rd.exports;
  iv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), Rd.exports = k1(), Rd.exports;
}
var sv;
function _1() {
  if (sv) return ei;
  sv = 1;
  var n = j1(), o = xi(), a = wb();
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
    for (var l = e, r = t; ; ) {
      var s = l.return;
      if (s === null) break;
      var u = s.alternate;
      if (u === null) {
        if (r = s.return, r !== null) {
          l = r;
          continue;
        }
        break;
      }
      if (s.child === u.child) {
        for (u = s.child; u; ) {
          if (u === l) return m(s), e;
          if (u === r) return m(s), t;
          u = u.sibling;
        }
        throw Error(i(188));
      }
      if (l.return !== r.return) l = s, r = u;
      else {
        for (var h = !1, C = s.child; C; ) {
          if (C === l) {
            h = !0, l = s, r = u;
            break;
          }
          if (C === r) {
            h = !0, r = s, l = u;
            break;
          }
          C = C.sibling;
        }
        if (!h) {
          for (C = u.child; C; ) {
            if (C === l) {
              h = !0, l = u, r = s;
              break;
            }
            if (C === r) {
              h = !0, r = u, l = s;
              break;
            }
            C = C.sibling;
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
  var b = Object.assign, x = /* @__PURE__ */ Symbol.for("react.element"), R = /* @__PURE__ */ Symbol.for("react.transitional.element"), w = /* @__PURE__ */ Symbol.for("react.portal"), D = /* @__PURE__ */ Symbol.for("react.fragment"), T = /* @__PURE__ */ Symbol.for("react.strict_mode"), N = /* @__PURE__ */ Symbol.for("react.profiler"), A = /* @__PURE__ */ Symbol.for("react.consumer"), E = /* @__PURE__ */ Symbol.for("react.context"), z = /* @__PURE__ */ Symbol.for("react.forward_ref"), U = /* @__PURE__ */ Symbol.for("react.suspense"), j = /* @__PURE__ */ Symbol.for("react.suspense_list"), O = /* @__PURE__ */ Symbol.for("react.memo"), k = /* @__PURE__ */ Symbol.for("react.lazy"), G = /* @__PURE__ */ Symbol.for("react.activity"), P = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), ne = Symbol.iterator;
  function K(e) {
    return e === null || typeof e != "object" ? null : (e = ne && e[ne] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var Q = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Z(e) {
    if (e == null) return null;
    if (typeof e == "function")
      return e.$$typeof === Q ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case D:
        return "Fragment";
      case N:
        return "Profiler";
      case T:
        return "StrictMode";
      case U:
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
        case E:
          return e.displayName || "Context";
        case A:
          return (e._context.displayName || "Context") + ".Consumer";
        case z:
          var t = e.render;
          return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
        case O:
          return t = e.displayName || null, t !== null ? t : Z(e.type) || "Memo";
        case k:
          t = e._payload, e = e._init;
          try {
            return Z(e(t));
          } catch {
          }
      }
    return null;
  }
  var q = Array.isArray, _ = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Y = a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, B = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, F = [], I = -1;
  function M(e) {
    return { current: e };
  }
  function H(e) {
    0 > I || (e.current = F[I], F[I] = null, I--);
  }
  function te(e, t) {
    I++, F[I] = e.current, e.current = t;
  }
  var J = M(null), re = M(null), ie = M(null), oe = M(null);
  function se(e, t) {
    switch (te(ie, t), te(re, e), te(J, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? Ey(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI)
          t = Ey(t), e = Ty(t, e);
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
    H(J), te(J, e);
  }
  function ge() {
    H(J), H(re), H(ie);
  }
  function je(e) {
    e.memoizedState !== null && te(oe, e);
    var t = J.current, l = Ty(t, e.type);
    t !== l && (te(re, e), te(J, l));
  }
  function Ee(e) {
    re.current === e && (H(J), H(re)), oe.current === e && (H(oe), Qa._currentValue = B);
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
      var u = r.DetermineComponentFrameRoot(), h = u[0], C = u[1];
      if (h && C) {
        var L = h.split(`
`), W = C.split(`
`);
        for (s = r = 0; r < L.length && !L[r].includes("DetermineComponentFrameRoot"); )
          r++;
        for (; s < W.length && !W[s].includes(
          "DetermineComponentFrameRoot"
        ); )
          s++;
        if (r === L.length || s === W.length)
          for (r = L.length - 1, s = W.length - 1; 1 <= r && 0 <= s && L[r] !== W[s]; )
            s--;
        for (; 1 <= r && 0 <= s; r--, s--)
          if (L[r] !== W[s]) {
            if (r !== 1 || s !== 1)
              do
                if (r--, s--, 0 > s || L[r] !== W[s]) {
                  var ue = `
` + L[r].replace(" at new ", " at ");
                  return e.displayName && ue.includes("<anonymous>") && (ue = ue.replace("<anonymous>", e.displayName)), ue;
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
  var he = Object.prototype.hasOwnProperty, Se = n.unstable_scheduleCallback, Te = n.unstable_cancelCallback, Oe = n.unstable_shouldYield, He = n.unstable_requestPaint, ae = n.unstable_now, pe = n.unstable_getCurrentPriorityLevel, Ue = n.unstable_ImmediatePriority, ve = n.unstable_UserBlockingPriority, be = n.unstable_NormalPriority, We = n.unstable_LowPriority, rt = n.unstable_IdlePriority, pt = n.log, Dt = n.unstable_setDisableYieldValue, et = null, gt = null;
  function At(e) {
    if (typeof pt == "function" && Dt(e), gt && typeof gt.setStrictMode == "function")
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
  function Nt(e, t, l) {
    var r = e.pendingLanes;
    if (r === 0) return 0;
    var s = 0, u = e.suspendedLanes, h = e.pingedLanes;
    e = e.warmLanes;
    var C = r & 134217727;
    return C !== 0 ? (r = C & ~u, r !== 0 ? s = Ut(r) : (h &= C, h !== 0 ? s = Ut(h) : l || (l = C & ~e, l !== 0 && (s = Ut(l))))) : (C = r & ~u, C !== 0 ? s = Ut(C) : h !== 0 ? s = Ut(h) : l || (l = r & ~e, l !== 0 && (s = Ut(l)))), s === 0 ? 0 : t !== 0 && t !== s && (t & u) === 0 && (u = s & -s, l = t & -t, u >= l || u === 32 && (l & 4194048) !== 0) ? t : s;
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
  function Pn(e, t, l, r, s, u) {
    var h = e.pendingLanes;
    e.pendingLanes = l, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= l, e.entangledLanes &= l, e.errorRecoveryDisabledLanes &= l, e.shellSuspendCounter = 0;
    var C = e.entanglements, L = e.expirationTimes, W = e.hiddenUpdates;
    for (l = h & ~l; 0 < l; ) {
      var ue = 31 - mt(l), de = 1 << ue;
      C[ue] = 0, L[ue] = -1;
      var ee = W[ue];
      if (ee !== null)
        for (W[ue] = null, ue = 0; ue < ee.length; ue++) {
          var le = ee[ue];
          le !== null && (le.lane &= -536870913);
        }
      l &= ~de;
    }
    r !== 0 && hl(e, r, 0), u !== 0 && s === 0 && e.tag !== 0 && (e.suspendedLanes |= u & ~(h & ~t));
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
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Fy(e.type));
  }
  function nn(e, t) {
    var l = Y.p;
    try {
      return Y.p = e, t();
    } finally {
      Y.p = l;
    }
  }
  var Wt = Math.random().toString(36).slice(2), Ct = "__reactFiber$" + Wt, un = "__reactProps$" + Wt, rl = "__reactContainer$" + Wt, ua = "__reactEvents$" + Wt, Ai = "__reactListeners$" + Wt, hS = "__reactHandles$" + Wt, cg = "__reactResources$" + Wt, ca = "__reactMarker$" + Wt;
  function fc(e) {
    delete e[Ct], delete e[un], delete e[ua], delete e[Ai], delete e[hS];
  }
  function dr(e) {
    var t = e[Ct];
    if (t) return t;
    for (var l = e.parentNode; l; ) {
      if (t = l[rl] || l[Ct]) {
        if (l = t.alternate, t.child !== null || l !== null && l.child !== null)
          for (e = Dy(e); e !== null; ) {
            if (l = e[Ct]) return l;
            e = Dy(e);
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
  function fa(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(i(33));
  }
  function gr(e) {
    var t = e[cg];
    return t || (t = e[cg] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function ln(e) {
    e[ca] = !0;
  }
  var fg = /* @__PURE__ */ new Set(), dg = {};
  function _o(e, t) {
    mr(e, t), mr(e + "Capture", t);
  }
  function mr(e, t) {
    for (dg[e] = t, e = 0; e < t.length; e++)
      fg.add(t[e]);
  }
  var yS = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), pg = {}, gg = {};
  function vS(e) {
    return he.call(gg, e) ? !0 : he.call(pg, e) ? !1 : yS.test(e) ? gg[e] = !0 : (pg[e] = !0, !1);
  }
  function zi(e, t, l) {
    if (vS(t))
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
  function mg(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function bS(e, t, l) {
    var r = Object.getOwnPropertyDescriptor(
      e.constructor.prototype,
      t
    );
    if (!e.hasOwnProperty(t) && typeof r < "u" && typeof r.get == "function" && typeof r.set == "function") {
      var s = r.get, u = r.set;
      return Object.defineProperty(e, t, {
        configurable: !0,
        get: function() {
          return s.call(this);
        },
        set: function(h) {
          l = "" + h, u.call(this, h);
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
  function dc(e) {
    if (!e._valueTracker) {
      var t = mg(e) ? "checked" : "value";
      e._valueTracker = bS(
        e,
        t,
        "" + e[t]
      );
    }
  }
  function hg(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var l = t.getValue(), r = "";
    return e && (r = mg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== l ? (t.setValue(e), !0) : !1;
  }
  function Ni(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var xS = /[\n"\\]/g;
  function Gn(e) {
    return e.replace(
      xS,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function pc(e, t, l, r, s, u, h, C) {
    e.name = "", h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" ? e.type = h : e.removeAttribute("type"), t != null ? h === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Yn(t)) : e.value !== "" + Yn(t) && (e.value = "" + Yn(t)) : h !== "submit" && h !== "reset" || e.removeAttribute("value"), t != null ? gc(e, h, Yn(t)) : l != null ? gc(e, h, Yn(l)) : r != null && e.removeAttribute("value"), s == null && u != null && (e.defaultChecked = !!u), s != null && (e.checked = s && typeof s != "function" && typeof s != "symbol"), C != null && typeof C != "function" && typeof C != "symbol" && typeof C != "boolean" ? e.name = "" + Yn(C) : e.removeAttribute("name");
  }
  function yg(e, t, l, r, s, u, h, C) {
    if (u != null && typeof u != "function" && typeof u != "symbol" && typeof u != "boolean" && (e.type = u), t != null || l != null) {
      if (!(u !== "submit" && u !== "reset" || t != null)) {
        dc(e);
        return;
      }
      l = l != null ? "" + Yn(l) : "", t = t != null ? "" + Yn(t) : l, C || t === e.value || (e.value = t), e.defaultValue = t;
    }
    r = r ?? s, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = C ? e.checked : !!r, e.defaultChecked = !!r, h != null && typeof h != "function" && typeof h != "symbol" && typeof h != "boolean" && (e.name = h), dc(e);
  }
  function gc(e, t, l) {
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
  function vg(e, t, l) {
    if (t != null && (t = "" + Yn(t), t !== e.value && (e.value = t), l == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = l != null ? "" + Yn(l) : "";
  }
  function bg(e, t, l, r) {
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
    l = Yn(t), e.defaultValue = l, r = e.textContent, r === l && r !== "" && r !== null && (e.value = r), dc(e);
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
  var SS = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function xg(e, t, l) {
    var r = t.indexOf("--") === 0;
    l == null || typeof l == "boolean" || l === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, l) : typeof l != "number" || l === 0 || SS.has(t) ? t === "float" ? e.cssFloat = l : e[t] = ("" + l).trim() : e[t] = l + "px";
  }
  function Sg(e, t, l) {
    if (t != null && typeof t != "object")
      throw Error(i(62));
    if (e = e.style, l != null) {
      for (var r in l)
        !l.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
      for (var s in t)
        r = t[s], t.hasOwnProperty(s) && l[s] !== r && xg(e, s, r);
    } else
      for (var u in t)
        t.hasOwnProperty(u) && xg(e, u, t[u]);
  }
  function mc(e) {
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
  var wS = /* @__PURE__ */ new Map([
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
  ]), ES = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function ji(e) {
    return ES.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function bl() {
  }
  var hc = null;
  function yc(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var vr = null, br = null;
  function wg(e) {
    var t = pr(e);
    if (t && (e = t.stateNode)) {
      var l = e[un] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (pc(
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
                var s = r[un] || null;
                if (!s) throw Error(i(90));
                pc(
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
              r = l[t], r.form === e.form && hg(r);
          }
          break e;
        case "textarea":
          vg(e, l.value, l.defaultValue);
          break e;
        case "select":
          t = l.value, t != null && hr(e, !!l.multiple, t, !1);
      }
    }
  }
  var vc = !1;
  function Eg(e, t, l) {
    if (vc) return e(t, l);
    vc = !0;
    try {
      var r = e(t);
      return r;
    } finally {
      if (vc = !1, (vr !== null || br !== null) && (xs(), vr && (t = vr, e = br, br = vr = null, wg(t), e)))
        for (t = 0; t < e.length; t++) wg(e[t]);
    }
  }
  function da(e, t) {
    var l = e.stateNode;
    if (l === null) return null;
    var r = l[un] || null;
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
  var xl = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), bc = !1;
  if (xl)
    try {
      var pa = {};
      Object.defineProperty(pa, "passive", {
        get: function() {
          bc = !0;
        }
      }), window.addEventListener("test", pa, pa), window.removeEventListener("test", pa, pa);
    } catch {
      bc = !1;
    }
  var Jl = null, xc = null, ki = null;
  function Tg() {
    if (ki) return ki;
    var e, t = xc, l = t.length, r, s = "value" in Jl ? Jl.value : Jl.textContent, u = s.length;
    for (e = 0; e < l && t[e] === s[e]; e++) ;
    var h = l - e;
    for (r = 1; r <= h && t[l - r] === s[u - r]; r++) ;
    return ki = s.slice(e, 1 < r ? 1 - r : void 0);
  }
  function _i(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Hi() {
    return !0;
  }
  function Rg() {
    return !1;
  }
  function wn(e) {
    function t(l, r, s, u, h) {
      this._reactName = l, this._targetInst = s, this.type = r, this.nativeEvent = u, this.target = h, this.currentTarget = null;
      for (var C in e)
        e.hasOwnProperty(C) && (l = e[C], this[C] = l ? l(u) : u[C]);
      return this.isDefaultPrevented = (u.defaultPrevented != null ? u.defaultPrevented : u.returnValue === !1) ? Hi : Rg, this.isPropagationStopped = Rg, this;
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
  }, Ui = wn(Ho), ga = b({}, Ho, { view: 0, detail: 0 }), TS = wn(ga), Sc, wc, ma, Li = b({}, ga, {
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
    getModifierState: Tc,
    button: 0,
    buttons: 0,
    relatedTarget: function(e) {
      return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
    },
    movementX: function(e) {
      return "movementX" in e ? e.movementX : (e !== ma && (ma && e.type === "mousemove" ? (Sc = e.screenX - ma.screenX, wc = e.screenY - ma.screenY) : wc = Sc = 0, ma = e), Sc);
    },
    movementY: function(e) {
      return "movementY" in e ? e.movementY : wc;
    }
  }), Cg = wn(Li), RS = b({}, Li, { dataTransfer: 0 }), CS = wn(RS), OS = b({}, ga, { relatedTarget: 0 }), Ec = wn(OS), MS = b({}, Ho, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), AS = wn(MS), zS = b({}, Ho, {
    clipboardData: function(e) {
      return "clipboardData" in e ? e.clipboardData : window.clipboardData;
    }
  }), DS = wn(zS), NS = b({}, Ho, { data: 0 }), Og = wn(NS), jS = {
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
  }, kS = {
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
  }, _S = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function HS(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = _S[e]) ? !!t[e] : !1;
  }
  function Tc() {
    return HS;
  }
  var US = b({}, ga, {
    key: function(e) {
      if (e.key) {
        var t = jS[e.key] || e.key;
        if (t !== "Unidentified") return t;
      }
      return e.type === "keypress" ? (e = _i(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? kS[e.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: Tc,
    charCode: function(e) {
      return e.type === "keypress" ? _i(e) : 0;
    },
    keyCode: function(e) {
      return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    },
    which: function(e) {
      return e.type === "keypress" ? _i(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
    }
  }), LS = wn(US), IS = b({}, Li, {
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
  }), Mg = wn(IS), BS = b({}, ga, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: Tc
  }), VS = wn(BS), PS = b({}, Ho, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), YS = wn(PS), GS = b({}, Li, {
    deltaX: function(e) {
      return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
    },
    deltaY: function(e) {
      return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), qS = wn(GS), XS = b({}, Ho, {
    newState: 0,
    oldState: 0
  }), FS = wn(XS), KS = [9, 13, 27, 32], Rc = xl && "CompositionEvent" in window, ha = null;
  xl && "documentMode" in document && (ha = document.documentMode);
  var QS = xl && "TextEvent" in window && !ha, Ag = xl && (!Rc || ha && 8 < ha && 11 >= ha), zg = " ", Dg = !1;
  function Ng(e, t) {
    switch (e) {
      case "keyup":
        return KS.indexOf(t.keyCode) !== -1;
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
  function jg(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var xr = !1;
  function ZS(e, t) {
    switch (e) {
      case "compositionend":
        return jg(t);
      case "keypress":
        return t.which !== 32 ? null : (Dg = !0, zg);
      case "textInput":
        return e = t.data, e === zg && Dg ? null : e;
      default:
        return null;
    }
  }
  function JS(e, t) {
    if (xr)
      return e === "compositionend" || !Rc && Ng(e, t) ? (e = Tg(), ki = xc = Jl = null, xr = !1, e) : null;
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
        return Ag && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var $S = {
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
  function kg(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!$S[e.type] : t === "textarea";
  }
  function _g(e, t, l, r) {
    vr ? br ? br.push(r) : br = [r] : vr = r, t = Os(t, "onChange"), 0 < t.length && (l = new Ui(
      "onChange",
      "change",
      null,
      l,
      r
    ), e.push({ event: l, listeners: t }));
  }
  var ya = null, va = null;
  function WS(e) {
    yy(e, 0);
  }
  function Ii(e) {
    var t = fa(e);
    if (hg(t)) return e;
  }
  function Hg(e, t) {
    if (e === "change") return t;
  }
  var Ug = !1;
  if (xl) {
    var Cc;
    if (xl) {
      var Oc = "oninput" in document;
      if (!Oc) {
        var Lg = document.createElement("div");
        Lg.setAttribute("oninput", "return;"), Oc = typeof Lg.oninput == "function";
      }
      Cc = Oc;
    } else Cc = !1;
    Ug = Cc && (!document.documentMode || 9 < document.documentMode);
  }
  function Ig() {
    ya && (ya.detachEvent("onpropertychange", Bg), va = ya = null);
  }
  function Bg(e) {
    if (e.propertyName === "value" && Ii(va)) {
      var t = [];
      _g(
        t,
        va,
        e,
        yc(e)
      ), Eg(WS, t);
    }
  }
  function ew(e, t, l) {
    e === "focusin" ? (Ig(), ya = t, va = l, ya.attachEvent("onpropertychange", Bg)) : e === "focusout" && Ig();
  }
  function tw(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Ii(va);
  }
  function nw(e, t) {
    if (e === "click") return Ii(t);
  }
  function lw(e, t) {
    if (e === "input" || e === "change")
      return Ii(t);
  }
  function ow(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Dn = typeof Object.is == "function" ? Object.is : ow;
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
  function Vg(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Pg(e, t) {
    var l = Vg(e);
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
      l = Vg(l);
    }
  }
  function Yg(e, t) {
    return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Yg(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Gg(e) {
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
  function Mc(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var rw = xl && "documentMode" in document && 11 >= document.documentMode, Sr = null, Ac = null, xa = null, zc = !1;
  function qg(e, t, l) {
    var r = l.window === l ? l.document : l.nodeType === 9 ? l : l.ownerDocument;
    zc || Sr == null || Sr !== Ni(r) || (r = Sr, "selectionStart" in r && Mc(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
      anchorNode: r.anchorNode,
      anchorOffset: r.anchorOffset,
      focusNode: r.focusNode,
      focusOffset: r.focusOffset
    }), xa && ba(xa, r) || (xa = r, r = Os(Ac, "onSelect"), 0 < r.length && (t = new Ui(
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
  }, Dc = {}, Xg = {};
  xl && (Xg = document.createElement("div").style, "AnimationEvent" in window || (delete wr.animationend.animation, delete wr.animationiteration.animation, delete wr.animationstart.animation), "TransitionEvent" in window || delete wr.transitionend.transition);
  function Lo(e) {
    if (Dc[e]) return Dc[e];
    if (!wr[e]) return e;
    var t = wr[e], l;
    for (l in t)
      if (t.hasOwnProperty(l) && l in Xg)
        return Dc[e] = t[l];
    return e;
  }
  var Fg = Lo("animationend"), Kg = Lo("animationiteration"), Qg = Lo("animationstart"), aw = Lo("transitionrun"), iw = Lo("transitionstart"), sw = Lo("transitioncancel"), Zg = Lo("transitionend"), Jg = /* @__PURE__ */ new Map(), Nc = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Nc.push("scrollEnd");
  function nl(e, t) {
    Jg.set(e, t), _o(t, [e]);
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
  }, qn = [], Er = 0, jc = 0;
  function Vi() {
    for (var e = Er, t = jc = Er = 0; t < e; ) {
      var l = qn[t];
      qn[t++] = null;
      var r = qn[t];
      qn[t++] = null;
      var s = qn[t];
      qn[t++] = null;
      var u = qn[t];
      if (qn[t++] = null, r !== null && s !== null) {
        var h = r.pending;
        h === null ? s.next = s : (s.next = h.next, h.next = s), r.pending = s;
      }
      u !== 0 && $g(l, s, u);
    }
  }
  function Pi(e, t, l, r) {
    qn[Er++] = e, qn[Er++] = t, qn[Er++] = l, qn[Er++] = r, jc |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
  }
  function kc(e, t, l, r) {
    return Pi(e, t, l, r), Yi(e);
  }
  function Io(e, t) {
    return Pi(e, null, null, t), Yi(e);
  }
  function $g(e, t, l) {
    e.lanes |= l;
    var r = e.alternate;
    r !== null && (r.lanes |= l);
    for (var s = !1, u = e.return; u !== null; )
      u.childLanes |= l, r = u.alternate, r !== null && (r.childLanes |= l), u.tag === 22 && (e = u.stateNode, e === null || e._visibility & 1 || (s = !0)), e = u, u = u.return;
    return e.tag === 3 ? (u = e.stateNode, s && t !== null && (s = 31 - mt(l), e = u.hiddenUpdates, r = e[s], r === null ? e[s] = [t] : r.push(t), t.lane = l | 536870912), u) : null;
  }
  function Yi(e) {
    if (50 < Pa)
      throw Pa = 0, Gf = null, Error(i(185));
    for (var t = e.return; t !== null; )
      e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Tr = {};
  function uw(e, t, l, r) {
    this.tag = e, this.key = l, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Nn(e, t, l, r) {
    return new uw(e, t, l, r);
  }
  function _c(e) {
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
  function Wg(e, t) {
    e.flags &= 65011714;
    var l = e.alternate;
    return l === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, e.type = l.type, t = l.dependencies, e.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), e;
  }
  function Gi(e, t, l, r, s, u) {
    var h = 0;
    if (r = e, typeof e == "function") _c(e) && (h = 1);
    else if (typeof e == "string")
      h = g1(
        e,
        l,
        J.current
      ) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else
      e: switch (e) {
        case G:
          return e = Nn(31, l, t, s), e.elementType = G, e.lanes = u, e;
        case D:
          return Bo(l.children, s, u, t);
        case T:
          h = 8, s |= 24;
          break;
        case N:
          return e = Nn(12, l, t, s | 2), e.elementType = N, e.lanes = u, e;
        case U:
          return e = Nn(13, l, t, s), e.elementType = U, e.lanes = u, e;
        case j:
          return e = Nn(19, l, t, s), e.elementType = j, e.lanes = u, e;
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case E:
                h = 10;
                break e;
              case A:
                h = 9;
                break e;
              case z:
                h = 11;
                break e;
              case O:
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
    return t = Nn(h, l, t, s), t.elementType = e, t.type = r, t.lanes = u, t;
  }
  function Bo(e, t, l, r) {
    return e = Nn(7, e, r, t), e.lanes = l, e;
  }
  function Hc(e, t, l) {
    return e = Nn(6, e, null, t), e.lanes = l, e;
  }
  function em(e) {
    var t = Nn(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function Uc(e, t, l) {
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
  var tm = /* @__PURE__ */ new WeakMap();
  function Xn(e, t) {
    if (typeof e == "object" && e !== null) {
      var l = tm.get(e);
      return l !== void 0 ? l : (t = {
        value: e,
        source: t,
        stack: Ce(t)
      }, tm.set(e, t), t);
    }
    return {
      value: e,
      source: t,
      stack: Ce(t)
    };
  }
  var Rr = [], Cr = 0, qi = null, Sa = 0, Fn = [], Kn = 0, $l = null, al = 1, il = "";
  function wl(e, t) {
    Rr[Cr++] = Sa, Rr[Cr++] = qi, qi = e, Sa = t;
  }
  function nm(e, t, l) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, $l = e;
    var r = al;
    e = il;
    var s = 32 - mt(r) - 1;
    r &= ~(1 << s), l += 1;
    var u = 32 - mt(t) + s;
    if (30 < u) {
      var h = s - s % 5;
      u = (r & (1 << h) - 1).toString(32), r >>= h, s -= h, al = 1 << 32 - mt(t) + s | l << s | r, il = u + e;
    } else
      al = 1 << u | l << s | r, il = e;
  }
  function Lc(e) {
    e.return !== null && (wl(e, 1), nm(e, 1, 0));
  }
  function Ic(e) {
    for (; e === qi; )
      qi = Rr[--Cr], Rr[Cr] = null, Sa = Rr[--Cr], Rr[Cr] = null;
    for (; e === $l; )
      $l = Fn[--Kn], Fn[Kn] = null, il = Fn[--Kn], Fn[Kn] = null, al = Fn[--Kn], Fn[Kn] = null;
  }
  function lm(e, t) {
    Fn[Kn++] = al, Fn[Kn++] = il, Fn[Kn++] = $l, al = t.id, il = t.overflow, $l = e;
  }
  var cn = null, jt = null, st = !1, Wl = null, Qn = !1, Bc = Error(i(519));
  function eo(e) {
    var t = Error(
      i(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw wa(Xn(t, e)), Bc;
  }
  function om(e) {
    var t = e.stateNode, l = e.type, r = e.memoizedProps;
    switch (t[Ct] = e, t[un] = r, l) {
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
        ot("invalid", t), yg(
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
        ot("invalid", t), bg(t, r.value, r.defaultValue, r.children);
    }
    l = r.children, typeof l != "string" && typeof l != "number" && typeof l != "bigint" || t.textContent === "" + l || r.suppressHydrationWarning === !0 || Sy(t.textContent, l) ? (r.popover != null && (ot("beforetoggle", t), ot("toggle", t)), r.onScroll != null && ot("scroll", t), r.onScrollEnd != null && ot("scrollend", t), r.onClick != null && (t.onclick = bl), t = !0) : t = !1, t || eo(e, !0);
  }
  function rm(e) {
    for (cn = e.return; cn; )
      switch (cn.tag) {
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
          cn = cn.return;
      }
  }
  function Or(e) {
    if (e !== cn) return !1;
    if (!st) return rm(e), st = !0, !1;
    var t = e.tag, l;
    if ((l = t !== 3 && t !== 27) && ((l = t === 5) && (l = e.type, l = !(l !== "form" && l !== "button") || rd(e.type, e.memoizedProps)), l = !l), l && jt && eo(e), rm(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      jt = zy(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(317));
      jt = zy(e);
    } else
      t === 27 ? (t = jt, mo(e.type) ? (e = cd, cd = null, jt = e) : jt = t) : jt = cn ? Jn(e.stateNode.nextSibling) : null;
    return !0;
  }
  function Vo() {
    jt = cn = null, st = !1;
  }
  function Vc() {
    var e = Wl;
    return e !== null && (Cn === null ? Cn = e : Cn.push.apply(
      Cn,
      e
    ), Wl = null), e;
  }
  function wa(e) {
    Wl === null ? Wl = [e] : Wl.push(e);
  }
  var Pc = M(null), Po = null, El = null;
  function to(e, t, l) {
    te(Pc, t._currentValue), t._currentValue = l;
  }
  function Tl(e) {
    e._currentValue = Pc.current, H(Pc);
  }
  function Yc(e, t, l) {
    for (; e !== null; ) {
      var r = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === l) break;
      e = e.return;
    }
  }
  function Gc(e, t, l, r) {
    var s = e.child;
    for (s !== null && (s.return = e); s !== null; ) {
      var u = s.dependencies;
      if (u !== null) {
        var h = s.child;
        u = u.firstContext;
        e: for (; u !== null; ) {
          var C = u;
          u = s;
          for (var L = 0; L < t.length; L++)
            if (C.context === t[L]) {
              u.lanes |= l, C = u.alternate, C !== null && (C.lanes |= l), Yc(
                u.return,
                l,
                e
              ), r || (h = null);
              break e;
            }
          u = C.next;
        }
      } else if (s.tag === 18) {
        if (h = s.return, h === null) throw Error(i(341));
        h.lanes |= l, u = h.alternate, u !== null && (u.lanes |= l), Yc(h, l, e), h = null;
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
    for (var s = t, u = !1; s !== null; ) {
      if (!u) {
        if ((s.flags & 524288) !== 0) u = !0;
        else if ((s.flags & 262144) !== 0) break;
      }
      if (s.tag === 10) {
        var h = s.alternate;
        if (h === null) throw Error(i(387));
        if (h = h.memoizedProps, h !== null) {
          var C = s.type;
          Dn(s.pendingProps.value, h.value) || (e !== null ? e.push(C) : e = [C]);
        }
      } else if (s === oe.current) {
        if (h = s.alternate, h === null) throw Error(i(387));
        h.memoizedState.memoizedState !== s.memoizedState.memoizedState && (e !== null ? e.push(Qa) : e = [Qa]);
      }
      s = s.return;
    }
    e !== null && Gc(
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
    return am(Po, e);
  }
  function Fi(e, t) {
    return Po === null && Yo(e), am(e, t);
  }
  function am(e, t) {
    var l = t._currentValue;
    if (t = { context: t, memoizedValue: l, next: null }, El === null) {
      if (e === null) throw Error(i(308));
      El = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else El = El.next = t;
    return l;
  }
  var cw = typeof AbortController < "u" ? AbortController : function() {
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
  }, fw = n.unstable_scheduleCallback, dw = n.unstable_NormalPriority, Qt = {
    $$typeof: E,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function qc() {
    return {
      controller: new cw(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ea(e) {
    e.refCount--, e.refCount === 0 && fw(dw, function() {
      e.controller.abort();
    });
  }
  var Ta = null, Xc = 0, Ar = 0, zr = null;
  function pw(e, t) {
    if (Ta === null) {
      var l = Ta = [];
      Xc = 0, Ar = Zf(), zr = {
        status: "pending",
        value: void 0,
        then: function(r) {
          l.push(r);
        }
      };
    }
    return Xc++, t.then(im, im), t;
  }
  function im() {
    if (--Xc === 0 && Ta !== null) {
      zr !== null && (zr.status = "fulfilled");
      var e = Ta;
      Ta = null, Ar = 0, zr = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function gw(e, t) {
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
  var sm = _.S;
  _.S = function(e, t) {
    qh = ae(), typeof t == "object" && t !== null && typeof t.then == "function" && pw(e, t), sm !== null && sm(e, t);
  };
  var Go = M(null);
  function Fc() {
    var e = Go.current;
    return e !== null ? e : Ot.pooledCache;
  }
  function Ki(e, t) {
    t === null ? te(Go, Go.current) : te(Go, t.pool);
  }
  function um() {
    var e = Fc();
    return e === null ? null : { parent: Qt._currentValue, pool: e };
  }
  var Dr = Error(i(460)), Kc = Error(i(474)), Qi = Error(i(542)), Zi = { then: function() {
  } };
  function cm(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function fm(e, t, l) {
    switch (l = e[l], l === void 0 ? e.push(t) : l !== t && (t.then(bl, bl), t = l), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, pm(e), e;
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
            throw e = t.reason, pm(e), e;
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
  function dm() {
    if (Xo === null) throw Error(i(459));
    var e = Xo;
    return Xo = null, e;
  }
  function pm(e) {
    if (e === Dr || e === Qi)
      throw Error(i(483));
  }
  var Nr = null, Ra = 0;
  function Ji(e) {
    var t = Ra;
    return Ra += 1, Nr === null && (Nr = []), fm(Nr, e, t);
  }
  function Ca(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function $i(e, t) {
    throw t.$$typeof === x ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(
      i(
        31,
        e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e
      )
    ));
  }
  function gm(e) {
    function t(X, V) {
      if (e) {
        var $ = X.deletions;
        $ === null ? (X.deletions = [V], X.flags |= 16) : $.push(V);
      }
    }
    function l(X, V) {
      if (!e) return null;
      for (; V !== null; )
        t(X, V), V = V.sibling;
      return null;
    }
    function r(X) {
      for (var V = /* @__PURE__ */ new Map(); X !== null; )
        X.key !== null ? V.set(X.key, X) : V.set(X.index, X), X = X.sibling;
      return V;
    }
    function s(X, V) {
      return X = Sl(X, V), X.index = 0, X.sibling = null, X;
    }
    function u(X, V, $) {
      return X.index = $, e ? ($ = X.alternate, $ !== null ? ($ = $.index, $ < V ? (X.flags |= 67108866, V) : $) : (X.flags |= 67108866, V)) : (X.flags |= 1048576, V);
    }
    function h(X) {
      return e && X.alternate === null && (X.flags |= 67108866), X;
    }
    function C(X, V, $, ce) {
      return V === null || V.tag !== 6 ? (V = Hc($, X.mode, ce), V.return = X, V) : (V = s(V, $), V.return = X, V);
    }
    function L(X, V, $, ce) {
      var Ie = $.type;
      return Ie === D ? ue(
        X,
        V,
        $.props.children,
        ce,
        $.key
      ) : V !== null && (V.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === k && qo(Ie) === V.type) ? (V = s(V, $.props), Ca(V, $), V.return = X, V) : (V = Gi(
        $.type,
        $.key,
        $.props,
        null,
        X.mode,
        ce
      ), Ca(V, $), V.return = X, V);
    }
    function W(X, V, $, ce) {
      return V === null || V.tag !== 4 || V.stateNode.containerInfo !== $.containerInfo || V.stateNode.implementation !== $.implementation ? (V = Uc($, X.mode, ce), V.return = X, V) : (V = s(V, $.children || []), V.return = X, V);
    }
    function ue(X, V, $, ce, Ie) {
      return V === null || V.tag !== 7 ? (V = Bo(
        $,
        X.mode,
        ce,
        Ie
      ), V.return = X, V) : (V = s(V, $), V.return = X, V);
    }
    function de(X, V, $) {
      if (typeof V == "string" && V !== "" || typeof V == "number" || typeof V == "bigint")
        return V = Hc(
          "" + V,
          X.mode,
          $
        ), V.return = X, V;
      if (typeof V == "object" && V !== null) {
        switch (V.$$typeof) {
          case R:
            return $ = Gi(
              V.type,
              V.key,
              V.props,
              null,
              X.mode,
              $
            ), Ca($, V), $.return = X, $;
          case w:
            return V = Uc(
              V,
              X.mode,
              $
            ), V.return = X, V;
          case k:
            return V = qo(V), de(X, V, $);
        }
        if (q(V) || K(V))
          return V = Bo(
            V,
            X.mode,
            $,
            null
          ), V.return = X, V;
        if (typeof V.then == "function")
          return de(X, Ji(V), $);
        if (V.$$typeof === E)
          return de(
            X,
            Fi(X, V),
            $
          );
        $i(X, V);
      }
      return null;
    }
    function ee(X, V, $, ce) {
      var Ie = V !== null ? V.key : null;
      if (typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint")
        return Ie !== null ? null : C(X, V, "" + $, ce);
      if (typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case R:
            return $.key === Ie ? L(X, V, $, ce) : null;
          case w:
            return $.key === Ie ? W(X, V, $, ce) : null;
          case k:
            return $ = qo($), ee(X, V, $, ce);
        }
        if (q($) || K($))
          return Ie !== null ? null : ue(X, V, $, ce, null);
        if (typeof $.then == "function")
          return ee(
            X,
            V,
            Ji($),
            ce
          );
        if ($.$$typeof === E)
          return ee(
            X,
            V,
            Fi(X, $),
            ce
          );
        $i(X, $);
      }
      return null;
    }
    function le(X, V, $, ce, Ie) {
      if (typeof ce == "string" && ce !== "" || typeof ce == "number" || typeof ce == "bigint")
        return X = X.get($) || null, C(V, X, "" + ce, Ie);
      if (typeof ce == "object" && ce !== null) {
        switch (ce.$$typeof) {
          case R:
            return X = X.get(
              ce.key === null ? $ : ce.key
            ) || null, L(V, X, ce, Ie);
          case w:
            return X = X.get(
              ce.key === null ? $ : ce.key
            ) || null, W(V, X, ce, Ie);
          case k:
            return ce = qo(ce), le(
              X,
              V,
              $,
              ce,
              Ie
            );
        }
        if (q(ce) || K(ce))
          return X = X.get($) || null, ue(V, X, ce, Ie, null);
        if (typeof ce.then == "function")
          return le(
            X,
            V,
            $,
            Ji(ce),
            Ie
          );
        if (ce.$$typeof === E)
          return le(
            X,
            V,
            $,
            Fi(V, ce),
            Ie
          );
        $i(V, ce);
      }
      return null;
    }
    function De(X, V, $, ce) {
      for (var Ie = null, ut = null, Ne = V, Fe = V = 0, it = null; Ne !== null && Fe < $.length; Fe++) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var ct = ee(
          X,
          Ne,
          $[Fe],
          ce
        );
        if (ct === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && ct.alternate === null && t(X, Ne), V = u(ct, V, Fe), ut === null ? Ie = ct : ut.sibling = ct, ut = ct, Ne = it;
      }
      if (Fe === $.length)
        return l(X, Ne), st && wl(X, Fe), Ie;
      if (Ne === null) {
        for (; Fe < $.length; Fe++)
          Ne = de(X, $[Fe], ce), Ne !== null && (V = u(
            Ne,
            V,
            Fe
          ), ut === null ? Ie = Ne : ut.sibling = Ne, ut = Ne);
        return st && wl(X, Fe), Ie;
      }
      for (Ne = r(Ne); Fe < $.length; Fe++)
        it = le(
          Ne,
          X,
          Fe,
          $[Fe],
          ce
        ), it !== null && (e && it.alternate !== null && Ne.delete(
          it.key === null ? Fe : it.key
        ), V = u(
          it,
          V,
          Fe
        ), ut === null ? Ie = it : ut.sibling = it, ut = it);
      return e && Ne.forEach(function(xo) {
        return t(X, xo);
      }), st && wl(X, Fe), Ie;
    }
    function Ve(X, V, $, ce) {
      if ($ == null) throw Error(i(151));
      for (var Ie = null, ut = null, Ne = V, Fe = V = 0, it = null, ct = $.next(); Ne !== null && !ct.done; Fe++, ct = $.next()) {
        Ne.index > Fe ? (it = Ne, Ne = null) : it = Ne.sibling;
        var xo = ee(X, Ne, ct.value, ce);
        if (xo === null) {
          Ne === null && (Ne = it);
          break;
        }
        e && Ne && xo.alternate === null && t(X, Ne), V = u(xo, V, Fe), ut === null ? Ie = xo : ut.sibling = xo, ut = xo, Ne = it;
      }
      if (ct.done)
        return l(X, Ne), st && wl(X, Fe), Ie;
      if (Ne === null) {
        for (; !ct.done; Fe++, ct = $.next())
          ct = de(X, ct.value, ce), ct !== null && (V = u(ct, V, Fe), ut === null ? Ie = ct : ut.sibling = ct, ut = ct);
        return st && wl(X, Fe), Ie;
      }
      for (Ne = r(Ne); !ct.done; Fe++, ct = $.next())
        ct = le(Ne, X, Fe, ct.value, ce), ct !== null && (e && ct.alternate !== null && Ne.delete(ct.key === null ? Fe : ct.key), V = u(ct, V, Fe), ut === null ? Ie = ct : ut.sibling = ct, ut = ct);
      return e && Ne.forEach(function(R1) {
        return t(X, R1);
      }), st && wl(X, Fe), Ie;
    }
    function Et(X, V, $, ce) {
      if (typeof $ == "object" && $ !== null && $.type === D && $.key === null && ($ = $.props.children), typeof $ == "object" && $ !== null) {
        switch ($.$$typeof) {
          case R:
            e: {
              for (var Ie = $.key; V !== null; ) {
                if (V.key === Ie) {
                  if (Ie = $.type, Ie === D) {
                    if (V.tag === 7) {
                      l(
                        X,
                        V.sibling
                      ), ce = s(
                        V,
                        $.props.children
                      ), ce.return = X, X = ce;
                      break e;
                    }
                  } else if (V.elementType === Ie || typeof Ie == "object" && Ie !== null && Ie.$$typeof === k && qo(Ie) === V.type) {
                    l(
                      X,
                      V.sibling
                    ), ce = s(V, $.props), Ca(ce, $), ce.return = X, X = ce;
                    break e;
                  }
                  l(X, V);
                  break;
                } else t(X, V);
                V = V.sibling;
              }
              $.type === D ? (ce = Bo(
                $.props.children,
                X.mode,
                ce,
                $.key
              ), ce.return = X, X = ce) : (ce = Gi(
                $.type,
                $.key,
                $.props,
                null,
                X.mode,
                ce
              ), Ca(ce, $), ce.return = X, X = ce);
            }
            return h(X);
          case w:
            e: {
              for (Ie = $.key; V !== null; ) {
                if (V.key === Ie)
                  if (V.tag === 4 && V.stateNode.containerInfo === $.containerInfo && V.stateNode.implementation === $.implementation) {
                    l(
                      X,
                      V.sibling
                    ), ce = s(V, $.children || []), ce.return = X, X = ce;
                    break e;
                  } else {
                    l(X, V);
                    break;
                  }
                else t(X, V);
                V = V.sibling;
              }
              ce = Uc($, X.mode, ce), ce.return = X, X = ce;
            }
            return h(X);
          case k:
            return $ = qo($), Et(
              X,
              V,
              $,
              ce
            );
        }
        if (q($))
          return De(
            X,
            V,
            $,
            ce
          );
        if (K($)) {
          if (Ie = K($), typeof Ie != "function") throw Error(i(150));
          return $ = Ie.call($), Ve(
            X,
            V,
            $,
            ce
          );
        }
        if (typeof $.then == "function")
          return Et(
            X,
            V,
            Ji($),
            ce
          );
        if ($.$$typeof === E)
          return Et(
            X,
            V,
            Fi(X, $),
            ce
          );
        $i(X, $);
      }
      return typeof $ == "string" && $ !== "" || typeof $ == "number" || typeof $ == "bigint" ? ($ = "" + $, V !== null && V.tag === 6 ? (l(X, V.sibling), ce = s(V, $), ce.return = X, X = ce) : (l(X, V), ce = Hc($, X.mode, ce), ce.return = X, X = ce), h(X)) : l(X, V);
    }
    return function(X, V, $, ce) {
      try {
        Ra = 0;
        var Ie = Et(
          X,
          V,
          $,
          ce
        );
        return Nr = null, Ie;
      } catch (Ne) {
        if (Ne === Dr || Ne === Qi) throw Ne;
        var ut = Nn(29, Ne, null, X.mode);
        return ut.lanes = ce, ut.return = X, ut;
      }
    };
  }
  var Fo = gm(!0), mm = gm(!1), no = !1;
  function Qc(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function Zc(e, t) {
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
      return s === null ? t.next = t : (t.next = s.next, s.next = t), r.pending = t, t = Yi(e), $g(e, null, l), t;
    }
    return Pi(e, r, t, l), Yi(e);
  }
  function Oa(e, t, l) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (l & 4194048) !== 0)) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  function Jc(e, t) {
    var l = e.updateQueue, r = e.alternate;
    if (r !== null && (r = r.updateQueue, l === r)) {
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
        baseState: r.baseState,
        firstBaseUpdate: s,
        lastBaseUpdate: u,
        shared: r.shared,
        callbacks: r.callbacks
      }, e.updateQueue = l;
      return;
    }
    e = l.lastBaseUpdate, e === null ? l.firstBaseUpdate = t : e.next = t, l.lastBaseUpdate = t;
  }
  var $c = !1;
  function Ma() {
    if ($c) {
      var e = zr;
      if (e !== null) throw e;
    }
  }
  function Aa(e, t, l, r) {
    $c = !1;
    var s = e.updateQueue;
    no = !1;
    var u = s.firstBaseUpdate, h = s.lastBaseUpdate, C = s.shared.pending;
    if (C !== null) {
      s.shared.pending = null;
      var L = C, W = L.next;
      L.next = null, h === null ? u = W : h.next = W, h = L;
      var ue = e.alternate;
      ue !== null && (ue = ue.updateQueue, C = ue.lastBaseUpdate, C !== h && (C === null ? ue.firstBaseUpdate = W : C.next = W, ue.lastBaseUpdate = L));
    }
    if (u !== null) {
      var de = s.baseState;
      h = 0, ue = W = L = null, C = u;
      do {
        var ee = C.lane & -536870913, le = ee !== C.lane;
        if (le ? (at & ee) === ee : (r & ee) === ee) {
          ee !== 0 && ee === Ar && ($c = !0), ue !== null && (ue = ue.next = {
            lane: 0,
            tag: C.tag,
            payload: C.payload,
            callback: null,
            next: null
          });
          e: {
            var De = e, Ve = C;
            ee = t;
            var Et = l;
            switch (Ve.tag) {
              case 1:
                if (De = Ve.payload, typeof De == "function") {
                  de = De.call(Et, de, ee);
                  break e;
                }
                de = De;
                break e;
              case 3:
                De.flags = De.flags & -65537 | 128;
              case 0:
                if (De = Ve.payload, ee = typeof De == "function" ? De.call(Et, de, ee) : De, ee == null) break e;
                de = b({}, de, ee);
                break e;
              case 2:
                no = !0;
            }
          }
          ee = C.callback, ee !== null && (e.flags |= 64, le && (e.flags |= 8192), le = s.callbacks, le === null ? s.callbacks = [ee] : le.push(ee));
        } else
          le = {
            lane: ee,
            tag: C.tag,
            payload: C.payload,
            callback: C.callback,
            next: null
          }, ue === null ? (W = ue = le, L = de) : ue = ue.next = le, h |= ee;
        if (C = C.next, C === null) {
          if (C = s.shared.pending, C === null)
            break;
          le = C, C = le.next, le.next = null, s.lastBaseUpdate = le, s.shared.pending = null;
        }
      } while (!0);
      ue === null && (L = de), s.baseState = L, s.firstBaseUpdate = W, s.lastBaseUpdate = ue, u === null && (s.shared.lanes = 0), uo |= h, e.lanes = h, e.memoizedState = de;
    }
  }
  function hm(e, t) {
    if (typeof e != "function")
      throw Error(i(191, e));
    e.call(t);
  }
  function ym(e, t) {
    var l = e.callbacks;
    if (l !== null)
      for (e.callbacks = null, e = 0; e < l.length; e++)
        hm(l[e], t);
  }
  var jr = M(null), Wi = M(0);
  function vm(e, t) {
    e = jl, te(Wi, e), te(jr, t), jl = e | t.baseLanes;
  }
  function Wc() {
    te(Wi, jl), te(jr, jr.current);
  }
  function ef() {
    jl = Wi.current, H(jr), H(Wi);
  }
  var jn = M(null), Zn = null;
  function ro(e) {
    var t = e.alternate;
    te(Ft, Ft.current & 1), te(jn, e), Zn === null && (t === null || jr.current !== null || t.memoizedState !== null) && (Zn = e);
  }
  function tf(e) {
    te(Ft, Ft.current), te(jn, e), Zn === null && (Zn = e);
  }
  function bm(e) {
    e.tag === 22 ? (te(Ft, Ft.current), te(jn, e), Zn === null && (Zn = e)) : ao();
  }
  function ao() {
    te(Ft, Ft.current), te(jn, jn.current);
  }
  function kn(e) {
    H(jn), Zn === e && (Zn = null), H(Ft);
  }
  var Ft = M(0);
  function es(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var l = t.memoizedState;
        if (l !== null && (l = l.dehydrated, l === null || sd(l) || ud(l)))
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
  var Rl = 0, Xe = null, St = null, Zt = null, ts = !1, kr = !1, Ko = !1, ns = 0, za = 0, _r = null, mw = 0;
  function Bt() {
    throw Error(i(321));
  }
  function nf(e, t) {
    if (t === null) return !1;
    for (var l = 0; l < t.length && l < e.length; l++)
      if (!Dn(e[l], t[l])) return !1;
    return !0;
  }
  function lf(e, t, l, r, s, u) {
    return Rl = u, Xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, _.H = e === null || e.memoizedState === null ? nh : bf, Ko = !1, u = l(r, s), Ko = !1, kr && (u = Sm(
      t,
      l,
      r,
      s
    )), xm(e), u;
  }
  function xm(e) {
    _.H = ja;
    var t = St !== null && St.next !== null;
    if (Rl = 0, Zt = St = Xe = null, ts = !1, za = 0, _r = null, t) throw Error(i(300));
    e === null || Jt || (e = e.dependencies, e !== null && Xi(e) && (Jt = !0));
  }
  function Sm(e, t, l, r) {
    Xe = e;
    var s = 0;
    do {
      if (kr && (_r = null), za = 0, kr = !1, 25 <= s) throw Error(i(301));
      if (s += 1, Zt = St = null, e.updateQueue != null) {
        var u = e.updateQueue;
        u.lastEffect = null, u.events = null, u.stores = null, u.memoCache != null && (u.memoCache.index = 0);
      }
      _.H = lh, u = t(l, r);
    } while (kr);
    return u;
  }
  function hw() {
    var e = _.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Da(t) : t, e = e.useState()[0], (St !== null ? St.memoizedState : null) !== e && (Xe.flags |= 1024), t;
  }
  function of() {
    var e = ns !== 0;
    return ns = 0, e;
  }
  function rf(e, t, l) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l;
  }
  function af(e) {
    if (ts) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      ts = !1;
    }
    Rl = 0, Zt = St = Xe = null, kr = !1, za = ns = 0, _r = null;
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
  function Da(e) {
    var t = za;
    return za += 1, _r === null && (_r = []), e = fm(_r, e, t), t = Xe, (Zt === null ? t.memoizedState : Zt.next) === null && (t = t.alternate, _.H = t === null || t.memoizedState === null ? nh : bf), e;
  }
  function os(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Da(e);
      if (e.$$typeof === E) return fn(e);
    }
    throw Error(i(438, String(e)));
  }
  function sf(e) {
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
        l[r] = P;
    return t.index++, l;
  }
  function Cl(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function rs(e) {
    var t = Kt();
    return uf(t, St, e);
  }
  function uf(e, t, l) {
    var r = e.queue;
    if (r === null) throw Error(i(311));
    r.lastRenderedReducer = l;
    var s = e.baseQueue, u = r.pending;
    if (u !== null) {
      if (s !== null) {
        var h = s.next;
        s.next = u.next, u.next = h;
      }
      t.baseQueue = s = u, r.pending = null;
    }
    if (u = e.baseState, s === null) e.memoizedState = u;
    else {
      t = s.next;
      var C = h = null, L = null, W = t, ue = !1;
      do {
        var de = W.lane & -536870913;
        if (de !== W.lane ? (at & de) === de : (Rl & de) === de) {
          var ee = W.revertLane;
          if (ee === 0)
            L !== null && (L = L.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: W.action,
              hasEagerState: W.hasEagerState,
              eagerState: W.eagerState,
              next: null
            }), de === Ar && (ue = !0);
          else if ((Rl & ee) === ee) {
            W = W.next, ee === Ar && (ue = !0);
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
            }, L === null ? (C = L = de, h = u) : L = L.next = de, Xe.lanes |= ee, uo |= ee;
          de = W.action, Ko && l(u, de), u = W.hasEagerState ? W.eagerState : l(u, de);
        } else
          ee = {
            lane: de,
            revertLane: W.revertLane,
            gesture: W.gesture,
            action: W.action,
            hasEagerState: W.hasEagerState,
            eagerState: W.eagerState,
            next: null
          }, L === null ? (C = L = ee, h = u) : L = L.next = ee, Xe.lanes |= de, uo |= de;
        W = W.next;
      } while (W !== null && W !== t);
      if (L === null ? h = u : L.next = C, !Dn(u, e.memoizedState) && (Jt = !0, ue && (l = zr, l !== null)))
        throw l;
      e.memoizedState = u, e.baseState = h, e.baseQueue = L, r.lastRenderedState = u;
    }
    return s === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
  }
  function cf(e) {
    var t = Kt(), l = t.queue;
    if (l === null) throw Error(i(311));
    l.lastRenderedReducer = e;
    var r = l.dispatch, s = l.pending, u = t.memoizedState;
    if (s !== null) {
      l.pending = null;
      var h = s = s.next;
      do
        u = e(u, h.action), h = h.next;
      while (h !== s);
      Dn(u, t.memoizedState) || (Jt = !0), t.memoizedState = u, t.baseQueue === null && (t.baseState = u), l.lastRenderedState = u;
    }
    return [u, r];
  }
  function wm(e, t, l) {
    var r = Xe, s = Kt(), u = st;
    if (u) {
      if (l === void 0) throw Error(i(407));
      l = l();
    } else l = t();
    var h = !Dn(
      (St || s).memoizedState,
      l
    );
    if (h && (s.memoizedState = l, Jt = !0), s = s.queue, pf(Rm.bind(null, r, s, e), [
      e
    ]), s.getSnapshot !== t || h || Zt !== null && Zt.memoizedState.tag & 1) {
      if (r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        Tm.bind(
          null,
          r,
          s,
          l,
          t
        ),
        null
      ), Ot === null) throw Error(i(349));
      u || (Rl & 127) !== 0 || Em(r, t, l);
    }
    return l;
  }
  function Em(e, t, l) {
    e.flags |= 16384, e = { getSnapshot: t, value: l }, t = Xe.updateQueue, t === null ? (t = ls(), Xe.updateQueue = t, t.stores = [e]) : (l = t.stores, l === null ? t.stores = [e] : l.push(e));
  }
  function Tm(e, t, l, r) {
    t.value = l, t.getSnapshot = r, Cm(t) && Om(e);
  }
  function Rm(e, t, l) {
    return l(function() {
      Cm(t) && Om(e);
    });
  }
  function Cm(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var l = t();
      return !Dn(e, l);
    } catch {
      return !0;
    }
  }
  function Om(e) {
    var t = Io(e, 2);
    t !== null && On(t, e, 2);
  }
  function ff(e) {
    var t = yn();
    if (typeof e == "function") {
      var l = e;
      if (e = l(), Ko) {
        At(!0);
        try {
          l();
        } finally {
          At(!1);
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
  function Mm(e, t, l, r) {
    return e.baseState = l, uf(
      e,
      St,
      typeof r == "function" ? r : Cl
    );
  }
  function yw(e, t, l, r, s) {
    if (ss(e)) throw Error(i(485));
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
      _.T !== null ? l(!0) : u.isTransition = !1, r(u), l = t.pending, l === null ? (u.next = t.pending = u, Am(t, u)) : (u.next = l.next, t.pending = l.next = u);
    }
  }
  function Am(e, t) {
    var l = t.action, r = t.payload, s = e.state;
    if (t.isTransition) {
      var u = _.T, h = {};
      _.T = h;
      try {
        var C = l(s, r), L = _.S;
        L !== null && L(h, C), zm(e, t, C);
      } catch (W) {
        df(e, t, W);
      } finally {
        u !== null && h.types !== null && (u.types = h.types), _.T = u;
      }
    } else
      try {
        u = l(s, r), zm(e, t, u);
      } catch (W) {
        df(e, t, W);
      }
  }
  function zm(e, t, l) {
    l !== null && typeof l == "object" && typeof l.then == "function" ? l.then(
      function(r) {
        Dm(e, t, r);
      },
      function(r) {
        return df(e, t, r);
      }
    ) : Dm(e, t, l);
  }
  function Dm(e, t, l) {
    t.status = "fulfilled", t.value = l, Nm(t), e.state = l, t = e.pending, t !== null && (l = t.next, l === t ? e.pending = null : (l = l.next, t.next = l, Am(e, l)));
  }
  function df(e, t, l) {
    var r = e.pending;
    if (e.pending = null, r !== null) {
      r = r.next;
      do
        t.status = "rejected", t.reason = l, Nm(t), t = t.next;
      while (t !== r);
    }
    e.action = null;
  }
  function Nm(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function jm(e, t) {
    return t;
  }
  function km(e, t) {
    if (st) {
      var l = Ot.formState;
      if (l !== null) {
        e: {
          var r = Xe;
          if (st) {
            if (jt) {
              t: {
                for (var s = jt, u = Qn; s.nodeType !== 8; ) {
                  if (!u) {
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
                u = s.data, s = u === "F!" || u === "F" ? s : null;
              }
              if (s) {
                jt = Jn(
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
      lastRenderedReducer: jm,
      lastRenderedState: t
    }, l.queue = r, l = Wm.bind(
      null,
      Xe,
      r
    ), r.dispatch = l, r = ff(!1), u = vf.bind(
      null,
      Xe,
      !1,
      r.queue
    ), r = yn(), s = {
      state: t,
      dispatch: null,
      action: e,
      pending: null
    }, r.queue = s, l = yw.bind(
      null,
      Xe,
      s,
      u,
      l
    ), s.dispatch = l, r.memoizedState = e, [t, l, !1];
  }
  function _m(e) {
    var t = Kt();
    return Hm(t, St, e);
  }
  function Hm(e, t, l) {
    if (t = uf(
      e,
      t,
      jm
    )[0], e = rs(Cl)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var r = Da(t);
      } catch (h) {
        throw h === Dr ? Qi : h;
      }
    else r = t;
    t = Kt();
    var s = t.queue, u = s.dispatch;
    return l !== t.memoizedState && (Xe.flags |= 2048, Hr(
      9,
      { destroy: void 0 },
      vw.bind(null, s, l),
      null
    )), [r, u, e];
  }
  function vw(e, t) {
    e.action = t;
  }
  function Um(e) {
    var t = Kt(), l = St;
    if (l !== null)
      return Hm(t, l, e);
    Kt(), t = t.memoizedState, l = Kt();
    var r = l.queue.dispatch;
    return l.memoizedState = e, [t, r, !1];
  }
  function Hr(e, t, l, r) {
    return e = { tag: e, create: l, deps: r, inst: t, next: null }, t = Xe.updateQueue, t === null && (t = ls(), Xe.updateQueue = t), l = t.lastEffect, l === null ? t.lastEffect = e.next = e : (r = l.next, l.next = e, e.next = r, t.lastEffect = e), e;
  }
  function Lm() {
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
    var u = s.memoizedState.inst;
    St !== null && r !== null && nf(r, St.memoizedState.deps) ? s.memoizedState = Hr(t, u, l, r) : (Xe.flags |= e, s.memoizedState = Hr(
      1 | t,
      u,
      l,
      r
    ));
  }
  function Im(e, t) {
    as(8390656, 8, e, t);
  }
  function pf(e, t) {
    is(2048, 8, e, t);
  }
  function bw(e) {
    Xe.flags |= 4;
    var t = Xe.updateQueue;
    if (t === null)
      t = ls(), Xe.updateQueue = t, t.events = [e];
    else {
      var l = t.events;
      l === null ? t.events = [e] : l.push(e);
    }
  }
  function Bm(e) {
    var t = Kt().memoizedState;
    return bw({ ref: t, nextImpl: e }), function() {
      if ((dt & 2) !== 0) throw Error(i(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function Vm(e, t) {
    return is(4, 2, e, t);
  }
  function Pm(e, t) {
    return is(4, 4, e, t);
  }
  function Ym(e, t) {
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
  function Gm(e, t, l) {
    l = l != null ? l.concat([e]) : null, is(4, 4, Ym.bind(null, t, e), l);
  }
  function gf() {
  }
  function qm(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    return t !== null && nf(t, r[1]) ? r[0] : (l.memoizedState = [e, t], e);
  }
  function Xm(e, t) {
    var l = Kt();
    t = t === void 0 ? null : t;
    var r = l.memoizedState;
    if (t !== null && nf(t, r[1]))
      return r[0];
    if (r = e(), Ko) {
      At(!0);
      try {
        e();
      } finally {
        At(!1);
      }
    }
    return l.memoizedState = [r, t], r;
  }
  function mf(e, t, l) {
    return l === void 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = l, e = Fh(), Xe.lanes |= e, uo |= e, l);
  }
  function Fm(e, t, l, r) {
    return Dn(l, t) ? l : jr.current !== null ? (e = mf(e, l, r), Dn(e, t) || (Jt = !0), e) : (Rl & 42) === 0 || (Rl & 1073741824) !== 0 && (at & 261930) === 0 ? (Jt = !0, e.memoizedState = l) : (e = Fh(), Xe.lanes |= e, uo |= e, t);
  }
  function Km(e, t, l, r, s) {
    var u = Y.p;
    Y.p = u !== 0 && 8 > u ? u : 8;
    var h = _.T, C = {};
    _.T = C, vf(e, !1, t, l);
    try {
      var L = s(), W = _.S;
      if (W !== null && W(C, L), L !== null && typeof L == "object" && typeof L.then == "function") {
        var ue = gw(
          L,
          r
        );
        Na(
          e,
          t,
          ue,
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
      Y.p = u, h !== null && C.types !== null && (h.types = C.types), _.T = h;
    }
  }
  function xw() {
  }
  function hf(e, t, l, r) {
    if (e.tag !== 5) throw Error(i(476));
    var s = Qm(e).queue;
    Km(
      e,
      s,
      t,
      B,
      l === null ? xw : function() {
        return Zm(e), l(r);
      }
    );
  }
  function Qm(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: B,
      baseState: B,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Cl,
        lastRenderedState: B
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
  function Zm(e) {
    var t = Qm(e);
    t.next === null && (t = e.alternate.memoizedState), Na(
      e,
      t.next.queue,
      {},
      Un()
    );
  }
  function yf() {
    return fn(Qa);
  }
  function Jm() {
    return Kt().memoizedState;
  }
  function $m() {
    return Kt().memoizedState;
  }
  function Sw(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var l = Un();
          e = lo(l);
          var r = oo(t, e, l);
          r !== null && (On(r, t, l), Oa(r, t, l)), t = { cache: qc() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function ww(e, t, l) {
    var r = Un();
    l = {
      lane: r,
      revertLane: 0,
      gesture: null,
      action: l,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ss(e) ? eh(t, l) : (l = kc(e, t, l, r), l !== null && (On(l, e, r), th(l, t, r)));
  }
  function Wm(e, t, l) {
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
    if (ss(e)) eh(t, s);
    else {
      var u = e.alternate;
      if (e.lanes === 0 && (u === null || u.lanes === 0) && (u = t.lastRenderedReducer, u !== null))
        try {
          var h = t.lastRenderedState, C = u(h, l);
          if (s.hasEagerState = !0, s.eagerState = C, Dn(C, h))
            return Pi(e, t, s, 0), Ot === null && Vi(), !1;
        } catch {
        }
      if (l = kc(e, t, s, r), l !== null)
        return On(l, e, r), th(l, t, r), !0;
    }
    return !1;
  }
  function vf(e, t, l, r) {
    if (r = {
      lane: 2,
      revertLane: Zf(),
      gesture: null,
      action: r,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ss(e)) {
      if (t) throw Error(i(479));
    } else
      t = kc(
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
  function eh(e, t) {
    kr = ts = !0;
    var l = e.pending;
    l === null ? t.next = t : (t.next = l.next, l.next = t), e.pending = t;
  }
  function th(e, t, l) {
    if ((l & 4194048) !== 0) {
      var r = t.lanes;
      r &= e.pendingLanes, l |= r, t.lanes = l, tl(e, l);
    }
  }
  var ja = {
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
  ja.useEffectEvent = Bt;
  var nh = {
    readContext: fn,
    use: os,
    useCallback: function(e, t) {
      return yn().memoizedState = [
        e,
        t === void 0 ? null : t
      ], e;
    },
    useContext: fn,
    useEffect: Im,
    useImperativeHandle: function(e, t, l) {
      l = l != null ? l.concat([e]) : null, as(
        4194308,
        4,
        Ym.bind(null, t, e),
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
        At(!0);
        try {
          e();
        } finally {
          At(!1);
        }
      }
      return l.memoizedState = [r, t], r;
    },
    useReducer: function(e, t, l) {
      var r = yn();
      if (l !== void 0) {
        var s = l(t);
        if (Ko) {
          At(!0);
          try {
            l(t);
          } finally {
            At(!1);
          }
        }
      } else s = t;
      return r.memoizedState = r.baseState = s, e = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: e,
        lastRenderedState: s
      }, r.queue = e, e = e.dispatch = ww.bind(
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
      e = ff(e);
      var t = e.queue, l = Wm.bind(null, Xe, t);
      return t.dispatch = l, [e.memoizedState, l];
    },
    useDebugValue: gf,
    useDeferredValue: function(e, t) {
      var l = yn();
      return mf(l, e, t);
    },
    useTransition: function() {
      var e = ff(!1);
      return e = Km.bind(
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
        (at & 127) !== 0 || Em(r, t, l);
      }
      s.memoizedState = l;
      var u = { value: l, getSnapshot: t };
      return s.queue = u, Im(Rm.bind(null, r, u, e), [
        e
      ]), r.flags |= 2048, Hr(
        9,
        { destroy: void 0 },
        Tm.bind(
          null,
          r,
          u,
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
        l = mw++, t = "_" + t + "r_" + l.toString(32) + "_";
      return e.memoizedState = t;
    },
    useHostTransitionStatus: yf,
    useFormState: km,
    useActionState: km,
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
      return t.queue = l, t = vf.bind(
        null,
        Xe,
        !0,
        l
      ), l.dispatch = t, [e, t];
    },
    useMemoCache: sf,
    useCacheRefresh: function() {
      return yn().memoizedState = Sw.bind(
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
  }, bf = {
    readContext: fn,
    use: os,
    useCallback: qm,
    useContext: fn,
    useEffect: pf,
    useImperativeHandle: Gm,
    useInsertionEffect: Vm,
    useLayoutEffect: Pm,
    useMemo: Xm,
    useReducer: rs,
    useRef: Lm,
    useState: function() {
      return rs(Cl);
    },
    useDebugValue: gf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return Fm(
        l,
        St.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = rs(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: wm,
    useId: Jm,
    useHostTransitionStatus: yf,
    useFormState: _m,
    useActionState: _m,
    useOptimistic: function(e, t) {
      var l = Kt();
      return Mm(l, St, e, t);
    },
    useMemoCache: sf,
    useCacheRefresh: $m
  };
  bf.useEffectEvent = Bm;
  var lh = {
    readContext: fn,
    use: os,
    useCallback: qm,
    useContext: fn,
    useEffect: pf,
    useImperativeHandle: Gm,
    useInsertionEffect: Vm,
    useLayoutEffect: Pm,
    useMemo: Xm,
    useReducer: cf,
    useRef: Lm,
    useState: function() {
      return cf(Cl);
    },
    useDebugValue: gf,
    useDeferredValue: function(e, t) {
      var l = Kt();
      return St === null ? mf(l, e, t) : Fm(
        l,
        St.memoizedState,
        e,
        t
      );
    },
    useTransition: function() {
      var e = cf(Cl)[0], t = Kt().memoizedState;
      return [
        typeof e == "boolean" ? e : Da(e),
        t
      ];
    },
    useSyncExternalStore: wm,
    useId: Jm,
    useHostTransitionStatus: yf,
    useFormState: Um,
    useActionState: Um,
    useOptimistic: function(e, t) {
      var l = Kt();
      return St !== null ? Mm(l, St, e, t) : (l.baseState = e, [e, l.queue.dispatch]);
    },
    useMemoCache: sf,
    useCacheRefresh: $m
  };
  lh.useEffectEvent = Bm;
  function xf(e, t, l, r) {
    t = e.memoizedState, l = l(r, t), l = l == null ? t : b({}, t, l), e.memoizedState = l, e.lanes === 0 && (e.updateQueue.baseState = l);
  }
  var Sf = {
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
  function oh(e, t, l, r, s, u, h) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, u, h) : t.prototype && t.prototype.isPureReactComponent ? !ba(l, r) || !ba(s, u) : !0;
  }
  function rh(e, t, l, r) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(l, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(l, r), t.state !== e && Sf.enqueueReplaceState(t, t.state, null);
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
  function ah(e) {
    Bi(e);
  }
  function ih(e) {
    console.error(e);
  }
  function sh(e) {
    Bi(e);
  }
  function us(e, t) {
    try {
      var l = e.onUncaughtError;
      l(t.value, { componentStack: t.stack });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function uh(e, t, l) {
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
  function wf(e, t, l) {
    return l = lo(l), l.tag = 3, l.payload = { element: null }, l.callback = function() {
      us(e, t);
    }, l;
  }
  function ch(e) {
    return e = lo(e), e.tag = 3, e;
  }
  function fh(e, t, l, r) {
    var s = l.type.getDerivedStateFromError;
    if (typeof s == "function") {
      var u = r.value;
      e.payload = function() {
        return s(u);
      }, e.callback = function() {
        uh(t, l, r);
      };
    }
    var h = l.stateNode;
    h !== null && typeof h.componentDidCatch == "function" && (e.callback = function() {
      uh(t, l, r), typeof s != "function" && (co === null ? co = /* @__PURE__ */ new Set([this]) : co.add(this));
      var C = r.stack;
      this.componentDidCatch(r.value, {
        componentStack: C !== null ? C : ""
      });
    });
  }
  function Ew(e, t, l, r, s) {
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
            return Zn === null ? Ss() : l.alternate === null && Vt === 0 && (Vt = 3), l.flags &= -257, l.flags |= 65536, l.lanes = s, r === Zi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? l.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), Ff(e, r, s)), !1;
          case 22:
            return l.flags |= 65536, r === Zi ? l.flags |= 16384 : (t = l.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([r])
            }, l.updateQueue = t) : (l = t.retryQueue, l === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : l.add(r)), Ff(e, r, s)), !1;
        }
        throw Error(i(435, l.tag));
      }
      return Ff(e, r, s), Ss(), !1;
    }
    if (st)
      return t = jn.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = s, r !== Bc && (e = Error(i(422), { cause: r }), wa(Xn(e, l)))) : (r !== Bc && (t = Error(i(423), {
        cause: r
      }), wa(
        Xn(t, l)
      )), e = e.current.alternate, e.flags |= 65536, s &= -s, e.lanes |= s, r = Xn(r, l), s = wf(
        e.stateNode,
        r,
        s
      ), Jc(e, s), Vt !== 4 && (Vt = 2)), !1;
    var u = Error(i(520), { cause: r });
    if (u = Xn(u, l), Va === null ? Va = [u] : Va.push(u), Vt !== 4 && (Vt = 2), t === null) return !0;
    r = Xn(r, l), l = t;
    do {
      switch (l.tag) {
        case 3:
          return l.flags |= 65536, e = s & -s, l.lanes |= e, e = wf(l.stateNode, r, e), Jc(l, e), !1;
        case 1:
          if (t = l.type, u = l.stateNode, (l.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || u !== null && typeof u.componentDidCatch == "function" && (co === null || !co.has(u))))
            return l.flags |= 65536, s &= -s, l.lanes |= s, s = ch(s), fh(
              s,
              e,
              l,
              r
            ), Jc(l, s), !1;
      }
      l = l.return;
    } while (l !== null);
    return !1;
  }
  var Ef = Error(i(461)), Jt = !1;
  function dn(e, t, l, r) {
    t.child = e === null ? mm(t, null, l, r) : Fo(
      t,
      e.child,
      l,
      r
    );
  }
  function dh(e, t, l, r, s) {
    l = l.render;
    var u = t.ref;
    if ("ref" in r) {
      var h = {};
      for (var C in r)
        C !== "ref" && (h[C] = r[C]);
    } else h = r;
    return Yo(t), r = lf(
      e,
      t,
      l,
      h,
      u,
      s
    ), C = of(), e !== null && !Jt ? (rf(e, t, s), Ol(e, t, s)) : (st && C && Lc(t), t.flags |= 1, dn(e, t, r, s), t.child);
  }
  function ph(e, t, l, r, s) {
    if (e === null) {
      var u = l.type;
      return typeof u == "function" && !_c(u) && u.defaultProps === void 0 && l.compare === null ? (t.tag = 15, t.type = u, gh(
        e,
        t,
        u,
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
    if (u = e.child, !Df(e, s)) {
      var h = u.memoizedProps;
      if (l = l.compare, l = l !== null ? l : ba, l(h, r) && e.ref === t.ref)
        return Ol(e, t, s);
    }
    return t.flags |= 1, e = Sl(u, r), e.ref = t.ref, e.return = t, t.child = e;
  }
  function gh(e, t, l, r, s) {
    if (e !== null) {
      var u = e.memoizedProps;
      if (ba(u, r) && e.ref === t.ref)
        if (Jt = !1, t.pendingProps = r = u, Df(e, s))
          (e.flags & 131072) !== 0 && (Jt = !0);
        else
          return t.lanes = e.lanes, Ol(e, t, s);
    }
    return Tf(
      e,
      t,
      l,
      r,
      s
    );
  }
  function mh(e, t, l, r) {
    var s = r.children, u = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), r.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (u = u !== null ? u.baseLanes | l : l, e !== null) {
          for (r = t.child = e.child, s = 0; r !== null; )
            s = s | r.lanes | r.childLanes, r = r.sibling;
          r = s & ~u;
        } else r = 0, t.child = null;
        return hh(
          e,
          t,
          u,
          l,
          r
        );
      }
      if ((l & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Ki(
          t,
          u !== null ? u.cachePool : null
        ), u !== null ? vm(t, u) : Wc(), bm(t);
      else
        return r = t.lanes = 536870912, hh(
          e,
          t,
          u !== null ? u.baseLanes | l : l,
          l,
          r
        );
    } else
      u !== null ? (Ki(t, u.cachePool), vm(t, u), ao(), t.memoizedState = null) : (e !== null && Ki(t, null), Wc(), ao());
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
  function hh(e, t, l, r, s) {
    var u = Fc();
    return u = u === null ? null : { parent: Qt._currentValue, pool: u }, t.memoizedState = {
      baseLanes: l,
      cachePool: u
    }, e !== null && Ki(t, null), Wc(), bm(t), e !== null && Mr(e, t, r, !0), t.childLanes = s, null;
  }
  function cs(e, t) {
    return t = ds(
      { mode: t.mode, children: t.children },
      e.mode
    ), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function yh(e, t, l) {
    return Fo(t, e.child, null, l), e = cs(t, t.pendingProps), e.flags |= 2, kn(t), t.memoizedState = null, e;
  }
  function Tw(e, t, l) {
    var r = t.pendingProps, s = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (st) {
        if (r.mode === "hidden")
          return e = cs(t, r), t.lanes = 536870912, ka(null, e);
        if (tf(t), (e = jt) ? (e = Ay(
          e,
          Qn
        ), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = em(e), l.return = t, t.child = l, cn = t, jt = null)) : e = null, e === null) throw eo(t);
        return t.lanes = 536870912, null;
      }
      return cs(t, r);
    }
    var u = e.memoizedState;
    if (u !== null) {
      var h = u.dehydrated;
      if (tf(t), s)
        if (t.flags & 256)
          t.flags &= -257, t = yh(
            e,
            t,
            l
          );
        else if (t.memoizedState !== null)
          t.child = e.child, t.flags |= 128, t = null;
        else throw Error(i(558));
      else if (Jt || Mr(e, t, l, !1), s = (l & e.childLanes) !== 0, Jt || s) {
        if (r = Ot, r !== null && (h = yl(r, l), h !== 0 && h !== u.retryLane))
          throw u.retryLane = h, Io(e, h), On(r, e, h), Ef;
        Ss(), t = yh(
          e,
          t,
          l
        );
      } else
        e = u.treeContext, jt = Jn(h.nextSibling), cn = t, st = !0, Wl = null, Qn = !1, e !== null && lm(t, e), t = cs(t, r), t.flags |= 4096;
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
  function Tf(e, t, l, r, s) {
    return Yo(t), l = lf(
      e,
      t,
      l,
      r,
      void 0,
      s
    ), r = of(), e !== null && !Jt ? (rf(e, t, s), Ol(e, t, s)) : (st && r && Lc(t), t.flags |= 1, dn(e, t, l, s), t.child);
  }
  function vh(e, t, l, r, s, u) {
    return Yo(t), t.updateQueue = null, l = Sm(
      t,
      r,
      l,
      s
    ), xm(e), r = of(), e !== null && !Jt ? (rf(e, t, u), Ol(e, t, u)) : (st && r && Lc(t), t.flags |= 1, dn(e, t, l, u), t.child);
  }
  function bh(e, t, l, r, s) {
    if (Yo(t), t.stateNode === null) {
      var u = Tr, h = l.contextType;
      typeof h == "object" && h !== null && (u = fn(h)), u = new l(r, u), t.memoizedState = u.state !== null && u.state !== void 0 ? u.state : null, u.updater = Sf, t.stateNode = u, u._reactInternals = t, u = t.stateNode, u.props = r, u.state = t.memoizedState, u.refs = {}, Qc(t), h = l.contextType, u.context = typeof h == "object" && h !== null ? fn(h) : Tr, u.state = t.memoizedState, h = l.getDerivedStateFromProps, typeof h == "function" && (xf(
        t,
        l,
        h,
        r
      ), u.state = t.memoizedState), typeof l.getDerivedStateFromProps == "function" || typeof u.getSnapshotBeforeUpdate == "function" || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (h = u.state, typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount(), h !== u.state && Sf.enqueueReplaceState(u, u.state, null), Aa(t, r, u, s), Ma(), u.state = t.memoizedState), typeof u.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
    } else if (e === null) {
      u = t.stateNode;
      var C = t.memoizedProps, L = Qo(l, C);
      u.props = L;
      var W = u.context, ue = l.contextType;
      h = Tr, typeof ue == "object" && ue !== null && (h = fn(ue));
      var de = l.getDerivedStateFromProps;
      ue = typeof de == "function" || typeof u.getSnapshotBeforeUpdate == "function", C = t.pendingProps !== C, ue || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (C || W !== h) && rh(
        t,
        u,
        r,
        h
      ), no = !1;
      var ee = t.memoizedState;
      u.state = ee, Aa(t, r, u, s), Ma(), W = t.memoizedState, C || ee !== W || no ? (typeof de == "function" && (xf(
        t,
        l,
        de,
        r
      ), W = t.memoizedState), (L = no || oh(
        t,
        l,
        L,
        r,
        ee,
        W,
        h
      )) ? (ue || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount()), typeof u.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = W), u.props = r, u.state = W, u.context = h, r = L) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
    } else {
      u = t.stateNode, Zc(e, t), h = t.memoizedProps, ue = Qo(l, h), u.props = ue, de = t.pendingProps, ee = u.context, W = l.contextType, L = Tr, typeof W == "object" && W !== null && (L = fn(W)), C = l.getDerivedStateFromProps, (W = typeof C == "function" || typeof u.getSnapshotBeforeUpdate == "function") || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (h !== de || ee !== L) && rh(
        t,
        u,
        r,
        L
      ), no = !1, ee = t.memoizedState, u.state = ee, Aa(t, r, u, s), Ma();
      var le = t.memoizedState;
      h !== de || ee !== le || no || e !== null && e.dependencies !== null && Xi(e.dependencies) ? (typeof C == "function" && (xf(
        t,
        l,
        C,
        r
      ), le = t.memoizedState), (ue = no || oh(
        t,
        l,
        ue,
        r,
        ee,
        le,
        L
      ) || e !== null && e.dependencies !== null && Xi(e.dependencies)) ? (W || typeof u.UNSAFE_componentWillUpdate != "function" && typeof u.componentWillUpdate != "function" || (typeof u.componentWillUpdate == "function" && u.componentWillUpdate(r, le, L), typeof u.UNSAFE_componentWillUpdate == "function" && u.UNSAFE_componentWillUpdate(
        r,
        le,
        L
      )), typeof u.componentDidUpdate == "function" && (t.flags |= 4), typeof u.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof u.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = le), u.props = r, u.state = le, u.context = L, r = ue) : (typeof u.componentDidUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || h === e.memoizedProps && ee === e.memoizedState || (t.flags |= 1024), r = !1);
    }
    return u = r, fs(e, t), r = (t.flags & 128) !== 0, u || r ? (u = t.stateNode, l = r && typeof l.getDerivedStateFromError != "function" ? null : u.render(), t.flags |= 1, e !== null && r ? (t.child = Fo(
      t,
      e.child,
      null,
      s
    ), t.child = Fo(
      t,
      null,
      l,
      s
    )) : dn(e, t, l, s), t.memoizedState = u.state, e = t.child) : e = Ol(
      e,
      t,
      s
    ), e;
  }
  function xh(e, t, l, r) {
    return Vo(), t.flags |= 256, dn(e, t, l, r), t.child;
  }
  var Rf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function Cf(e) {
    return { baseLanes: e, cachePool: um() };
  }
  function Of(e, t, l) {
    return e = e !== null ? e.childLanes & ~l : 0, t && (e |= Hn), e;
  }
  function Sh(e, t, l) {
    var r = t.pendingProps, s = !1, u = (t.flags & 128) !== 0, h;
    if ((h = u) || (h = e !== null && e.memoizedState === null ? !1 : (Ft.current & 2) !== 0), h && (s = !0, t.flags &= -129), h = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (st) {
        if (s ? ro(t) : ao(), (e = jt) ? (e = Ay(
          e,
          Qn
        ), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
          dehydrated: e,
          treeContext: $l !== null ? { id: al, overflow: il } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, l = em(e), l.return = t, t.child = l, cn = t, jt = null)) : e = null, e === null) throw eo(t);
        return ud(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var C = r.children;
      return r = r.fallback, s ? (ao(), s = t.mode, C = ds(
        { mode: "hidden", children: C },
        s
      ), r = Bo(
        r,
        s,
        l,
        null
      ), C.return = t, r.return = t, C.sibling = r, t.child = C, r = t.child, r.memoizedState = Cf(l), r.childLanes = Of(
        e,
        h,
        l
      ), t.memoizedState = Rf, ka(null, r)) : (ro(t), Mf(t, C));
    }
    var L = e.memoizedState;
    if (L !== null && (C = L.dehydrated, C !== null)) {
      if (u)
        t.flags & 256 ? (ro(t), t.flags &= -257, t = Af(
          e,
          t,
          l
        )) : t.memoizedState !== null ? (ao(), t.child = e.child, t.flags |= 128, t = null) : (ao(), C = r.fallback, s = t.mode, r = ds(
          { mode: "visible", children: r.children },
          s
        ), C = Bo(
          C,
          s,
          l,
          null
        ), C.flags |= 2, r.return = t, C.return = t, r.sibling = C, t.child = r, Fo(
          t,
          e.child,
          null,
          l
        ), r = t.child, r.memoizedState = Cf(l), r.childLanes = Of(
          e,
          h,
          l
        ), t.memoizedState = Rf, t = ka(null, r));
      else if (ro(t), ud(C)) {
        if (h = C.nextSibling && C.nextSibling.dataset, h) var W = h.dgst;
        h = W, r = Error(i(419)), r.stack = "", r.digest = h, wa({ value: r, source: null, stack: null }), t = Af(
          e,
          t,
          l
        );
      } else if (Jt || Mr(e, t, l, !1), h = (l & e.childLanes) !== 0, Jt || h) {
        if (h = Ot, h !== null && (r = yl(h, l), r !== 0 && r !== L.retryLane))
          throw L.retryLane = r, Io(e, r), On(h, e, r), Ef;
        sd(C) || Ss(), t = Af(
          e,
          t,
          l
        );
      } else
        sd(C) ? (t.flags |= 192, t.child = e.child, t = null) : (e = L.treeContext, jt = Jn(
          C.nextSibling
        ), cn = t, st = !0, Wl = null, Qn = !1, e !== null && lm(t, e), t = Mf(
          t,
          r.children
        ), t.flags |= 4096);
      return t;
    }
    return s ? (ao(), C = r.fallback, s = t.mode, L = e.child, W = L.sibling, r = Sl(L, {
      mode: "hidden",
      children: r.children
    }), r.subtreeFlags = L.subtreeFlags & 65011712, W !== null ? C = Sl(
      W,
      C
    ) : (C = Bo(
      C,
      s,
      l,
      null
    ), C.flags |= 2), C.return = t, r.return = t, r.sibling = C, t.child = r, ka(null, r), r = t.child, C = e.child.memoizedState, C === null ? C = Cf(l) : (s = C.cachePool, s !== null ? (L = Qt._currentValue, s = s.parent !== L ? { parent: L, pool: L } : s) : s = um(), C = {
      baseLanes: C.baseLanes | l,
      cachePool: s
    }), r.memoizedState = C, r.childLanes = Of(
      e,
      h,
      l
    ), t.memoizedState = Rf, ka(e.child, r)) : (ro(t), l = e.child, e = l.sibling, l = Sl(l, {
      mode: "visible",
      children: r.children
    }), l.return = t, l.sibling = null, e !== null && (h = t.deletions, h === null ? (t.deletions = [e], t.flags |= 16) : h.push(e)), t.child = l, t.memoizedState = null, l);
  }
  function Mf(e, t) {
    return t = ds(
      { mode: "visible", children: t },
      e.mode
    ), t.return = e, e.child = t;
  }
  function ds(e, t) {
    return e = Nn(22, e, null, t), e.lanes = 0, e;
  }
  function Af(e, t, l) {
    return Fo(t, e.child, null, l), e = Mf(
      t,
      t.pendingProps.children
    ), e.flags |= 2, t.memoizedState = null, e;
  }
  function wh(e, t, l) {
    e.lanes |= t;
    var r = e.alternate;
    r !== null && (r.lanes |= t), Yc(e.return, t, l);
  }
  function zf(e, t, l, r, s, u) {
    var h = e.memoizedState;
    h === null ? e.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: r,
      tail: l,
      tailMode: s,
      treeForkCount: u
    } : (h.isBackwards = t, h.rendering = null, h.renderingStartTime = 0, h.last = r, h.tail = l, h.tailMode = s, h.treeForkCount = u);
  }
  function Eh(e, t, l) {
    var r = t.pendingProps, s = r.revealOrder, u = r.tail;
    r = r.children;
    var h = Ft.current, C = (h & 2) !== 0;
    if (C ? (h = h & 1 | 2, t.flags |= 128) : h &= 1, te(Ft, h), dn(e, t, r, l), r = st ? Sa : 0, !C && e !== null && (e.flags & 128) !== 0)
      e: for (e = t.child; e !== null; ) {
        if (e.tag === 13)
          e.memoizedState !== null && wh(e, l, t);
        else if (e.tag === 19)
          wh(e, l, t);
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
        l = s, l === null ? (s = t.child, t.child = null) : (s = l.sibling, l.sibling = null), zf(
          t,
          !1,
          s,
          l,
          u,
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
        zf(
          t,
          !0,
          l,
          null,
          u,
          r
        );
        break;
      case "together":
        zf(
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
  function Df(e, t) {
    return (e.lanes & t) !== 0 ? !0 : (e = e.dependencies, !!(e !== null && Xi(e)));
  }
  function Rw(e, t, l) {
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
          return t.flags |= 128, tf(t), null;
        break;
      case 13:
        var r = t.memoizedState;
        if (r !== null)
          return r.dehydrated !== null ? (ro(t), t.flags |= 128, null) : (l & t.child.childLanes) !== 0 ? Sh(e, t, l) : (ro(t), e = Ol(
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
            return Eh(
              e,
              t,
              l
            );
          t.flags |= 128;
        }
        if (s = t.memoizedState, s !== null && (s.rendering = null, s.tail = null, s.lastEffect = null), te(Ft, Ft.current), r) break;
        return null;
      case 22:
        return t.lanes = 0, mh(
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
  function Th(e, t, l) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps)
        Jt = !0;
      else {
        if (!Df(e, l) && (t.flags & 128) === 0)
          return Jt = !1, Rw(
            e,
            t,
            l
          );
        Jt = (e.flags & 131072) !== 0;
      }
    else
      Jt = !1, st && (t.flags & 1048576) !== 0 && nm(t, Sa, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var r = t.pendingProps;
          if (e = qo(t.elementType), t.type = e, typeof e == "function")
            _c(e) ? (r = Qo(e, r), t.tag = 1, t = bh(
              null,
              t,
              e,
              r,
              l
            )) : (t.tag = 0, t = Tf(
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
                t.tag = 11, t = dh(
                  null,
                  t,
                  e,
                  r,
                  l
                );
                break e;
              } else if (s === O) {
                t.tag = 14, t = ph(
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
        return Tf(
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
        ), bh(
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
          var u = t.memoizedState;
          s = u.element, Zc(e, t), Aa(t, r, null, l);
          var h = t.memoizedState;
          if (r = h.cache, to(t, Qt, r), r !== u.cache && Gc(
            t,
            [Qt],
            l,
            !0
          ), Ma(), r = h.element, u.isDehydrated)
            if (u = {
              element: r,
              isDehydrated: !1,
              cache: h.cache
            }, t.updateQueue.baseState = u, t.memoizedState = u, t.flags & 256) {
              t = xh(
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
              ), wa(s), t = xh(
                e,
                t,
                r,
                l
              );
              break e;
            } else
              for (e = t.stateNode.containerInfo, e.nodeType === 9 ? e = e.body : e = e.nodeName === "HTML" ? e.ownerDocument.body : e, jt = Jn(e.firstChild), cn = t, st = !0, Wl = null, Qn = !0, l = mm(
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
        return fs(e, t), e === null ? (l = _y(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = l : st || (l = t.type, e = t.pendingProps, r = Ms(
          ie.current
        ).createElement(l), r[Ct] = t, r[un] = e, pn(r, l, e), ln(r), t.stateNode = r) : t.memoizedState = _y(
          t.type,
          e.memoizedProps,
          t.pendingProps,
          e.memoizedState
        ), null;
      case 27:
        return je(t), e === null && st && (r = t.stateNode = Ny(
          t.type,
          t.pendingProps,
          ie.current
        ), cn = t, Qn = !0, s = jt, mo(t.type) ? (cd = s, jt = Jn(r.firstChild)) : jt = s), dn(
          e,
          t,
          t.pendingProps.children,
          l
        ), fs(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && st && ((s = r = jt) && (r = t1(
          r,
          t.type,
          t.pendingProps,
          Qn
        ), r !== null ? (t.stateNode = r, cn = t, jt = Jn(r.firstChild), Qn = !1, s = !0) : s = !1), s || eo(t)), je(t), s = t.type, u = t.pendingProps, h = e !== null ? e.memoizedProps : null, r = u.children, rd(s, u) ? r = null : h !== null && rd(s, h) && (t.flags |= 32), t.memoizedState !== null && (s = lf(
          e,
          t,
          hw,
          null,
          null,
          l
        ), Qa._currentValue = s), fs(e, t), dn(e, t, r, l), t.child;
      case 6:
        return e === null && st && ((e = l = jt) && (l = n1(
          l,
          t.pendingProps,
          Qn
        ), l !== null ? (t.stateNode = l, cn = t, jt = null, e = !0) : e = !1), e || eo(t)), null;
      case 13:
        return Sh(e, t, l);
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
        return dh(
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
        return ph(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 15:
        return gh(
          e,
          t,
          t.type,
          t.pendingProps,
          l
        );
      case 19:
        return Eh(e, t, l);
      case 31:
        return Tw(e, t, l);
      case 22:
        return mh(
          e,
          t,
          l,
          t.pendingProps
        );
      case 24:
        return Yo(t), r = fn(Qt), e === null ? (s = Fc(), s === null && (s = Ot, u = qc(), s.pooledCache = u, u.refCount++, u !== null && (s.pooledCacheLanes |= l), s = u), t.memoizedState = { parent: r, cache: s }, Qc(t), to(t, Qt, s)) : ((e.lanes & l) !== 0 && (Zc(e, t), Aa(t, null, null, l), Ma()), s = e.memoizedState, u = t.memoizedState, s.parent !== r ? (s = { parent: r, cache: r }, t.memoizedState = s, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = s), to(t, Qt, r)) : (r = u.cache, to(t, Qt, r), r !== s.cache && Gc(
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
  function Nf(e, t, l, r, s) {
    if ((t = (e.mode & 32) !== 0) && (t = !1), t) {
      if (e.flags |= 16777216, (s & 335544128) === s)
        if (e.stateNode.complete) e.flags |= 8192;
        else if (Jh()) e.flags |= 8192;
        else
          throw Xo = Zi, Kc;
    } else e.flags &= -16777217;
  }
  function Rh(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      e.flags &= -16777217;
    else if (e.flags |= 16777216, !By(t))
      if (Jh()) e.flags |= 8192;
      else
        throw Xo = Zi, Kc;
  }
  function ps(e, t) {
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
  function Cw(e, t, l) {
    var r = t.pendingProps;
    switch (Ic(t), t.tag) {
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
        return l = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Tl(Qt), ge(), l.pendingContext && (l.context = l.pendingContext, l.pendingContext = null), (e === null || e.child === null) && (Or(t) ? Ml(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Vc())), kt(t), null;
      case 26:
        var s = t.type, u = t.memoizedState;
        return e === null ? (Ml(t), u !== null ? (kt(t), Rh(t, u)) : (kt(t), Nf(
          t,
          s,
          null,
          r,
          l
        ))) : u ? u !== e.memoizedState ? (Ml(t), kt(t), Rh(t, u)) : (kt(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== r && Ml(t), kt(t), Nf(
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
            return kt(t), null;
          }
          e = J.current, Or(t) ? om(t) : (e = Ny(s, r, l), t.stateNode = e, Ml(t));
        }
        return kt(t), null;
      case 5:
        if (Ee(t), s = t.type, e !== null && t.stateNode != null)
          e.memoizedProps !== r && Ml(t);
        else {
          if (!r) {
            if (t.stateNode === null)
              throw Error(i(166));
            return kt(t), null;
          }
          if (u = J.current, Or(t))
            om(t);
          else {
            var h = Ms(
              ie.current
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
                    u = typeof r.is == "string" ? h.createElement("select", {
                      is: r.is
                    }) : h.createElement("select"), r.multiple ? u.multiple = !0 : r.size && (u.size = r.size);
                    break;
                  default:
                    u = typeof r.is == "string" ? h.createElement(s, { is: r.is }) : h.createElement(s);
                }
            }
            u[Ct] = t, u[un] = r;
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
            e: switch (pn(u, s, r), s) {
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
        return kt(t), Nf(
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
            if (e = t.stateNode, l = t.memoizedProps, r = null, s = cn, s !== null)
              switch (s.tag) {
                case 27:
                case 5:
                  r = s.memoizedProps;
              }
            e[Ct] = t, e = !!(e.nodeValue === l || r !== null && r.suppressHydrationWarning === !0 || Sy(e.nodeValue, l)), e || eo(t, !0);
          } else
            e = Ms(e).createTextNode(
              r
            ), e[Ct] = t, t.stateNode = e;
        }
        return kt(t), null;
      case 31:
        if (l = t.memoizedState, e === null || e.memoizedState !== null) {
          if (r = Or(t), l !== null) {
            if (e === null) {
              if (!r) throw Error(i(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(i(557));
              e[Ct] = t;
            } else
              Vo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            kt(t), e = !1;
          } else
            l = Vc(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), e = !0;
          if (!e)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(i(558));
        }
        return kt(t), null;
      case 13:
        if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (s = Or(t), r !== null && r.dehydrated !== null) {
            if (e === null) {
              if (!s) throw Error(i(318));
              if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(i(317));
              s[Ct] = t;
            } else
              Vo(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            kt(t), s = !1;
          } else
            s = Vc(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = s), s = !0;
          if (!s)
            return t.flags & 256 ? (kn(t), t) : (kn(t), null);
        }
        return kn(t), (t.flags & 128) !== 0 ? (t.lanes = l, t) : (l = r !== null, e = e !== null && e.memoizedState !== null, l && (r = t.child, s = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (s = r.alternate.memoizedState.cachePool.pool), u = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (u = r.memoizedState.cachePool.pool), u !== s && (r.flags |= 2048)), l !== e && l && (t.child.flags |= 8192), ps(t, t.updateQueue), kt(t), null);
      case 4:
        return ge(), e === null && ed(t.stateNode.containerInfo), kt(t), null;
      case 10:
        return Tl(t.type), kt(t), null;
      case 19:
        if (H(Ft), r = t.memoizedState, r === null) return kt(t), null;
        if (s = (t.flags & 128) !== 0, u = r.rendering, u === null)
          if (s) _a(r, !1);
          else {
            if (Vt !== 0 || e !== null && (e.flags & 128) !== 0)
              for (e = t.child; e !== null; ) {
                if (u = es(e), u !== null) {
                  for (t.flags |= 128, _a(r, !1), e = u.updateQueue, t.updateQueue = e, ps(t, e), t.subtreeFlags = 0, e = l, l = t.child; l !== null; )
                    Wg(l, e), l = l.sibling;
                  return te(
                    Ft,
                    Ft.current & 1 | 2
                  ), st && wl(t, r.treeForkCount), t.child;
                }
                e = e.sibling;
              }
            r.tail !== null && ae() > vs && (t.flags |= 128, s = !0, _a(r, !1), t.lanes = 4194304);
          }
        else {
          if (!s)
            if (e = es(u), e !== null) {
              if (t.flags |= 128, s = !0, e = e.updateQueue, t.updateQueue = e, ps(t, e), _a(r, !0), r.tail === null && r.tailMode === "hidden" && !u.alternate && !st)
                return kt(t), null;
            } else
              2 * ae() - r.renderingStartTime > vs && l !== 536870912 && (t.flags |= 128, s = !0, _a(r, !1), t.lanes = 4194304);
          r.isBackwards ? (u.sibling = t.child, t.child = u) : (e = r.last, e !== null ? e.sibling = u : t.child = u, r.last = u);
        }
        return r.tail !== null ? (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ae(), e.sibling = null, l = Ft.current, te(
          Ft,
          s ? l & 1 | 2 : l & 1
        ), st && wl(t, r.treeForkCount), e) : (kt(t), null);
      case 22:
      case 23:
        return kn(t), ef(), r = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== r && (t.flags |= 8192) : r && (t.flags |= 8192), r ? (l & 536870912) !== 0 && (t.flags & 128) === 0 && (kt(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : kt(t), l = t.updateQueue, l !== null && ps(t, l.retryQueue), l = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== l && (t.flags |= 2048), e !== null && H(Go), null;
      case 24:
        return l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), Tl(Qt), kt(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(i(156, t.tag));
  }
  function Ow(e, t) {
    switch (Ic(t), t.tag) {
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
        return H(Ft), null;
      case 4:
        return ge(), null;
      case 10:
        return Tl(t.type), null;
      case 22:
      case 23:
        return kn(t), ef(), e !== null && H(Go), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Tl(Qt), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Ch(e, t) {
    switch (Ic(t), t.tag) {
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
        H(Ft);
        break;
      case 10:
        Tl(t.type);
        break;
      case 22:
      case 23:
        kn(t), ef(), e !== null && H(Go);
        break;
      case 24:
        Tl(Qt);
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
            var u = l.create, h = l.inst;
            r = u(), h.destroy = r;
          }
          l = l.next;
        } while (l !== s);
      }
    } catch (C) {
      yt(t, t.return, C);
    }
  }
  function io(e, t, l) {
    try {
      var r = t.updateQueue, s = r !== null ? r.lastEffect : null;
      if (s !== null) {
        var u = s.next;
        r = u;
        do {
          if ((r.tag & e) === e) {
            var h = r.inst, C = h.destroy;
            if (C !== void 0) {
              h.destroy = void 0, s = t;
              var L = l, W = C;
              try {
                W();
              } catch (ue) {
                yt(
                  s,
                  L,
                  ue
                );
              }
            }
          }
          r = r.next;
        } while (r !== u);
      }
    } catch (ue) {
      yt(t, t.return, ue);
    }
  }
  function Oh(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var l = e.stateNode;
      try {
        ym(t, l);
      } catch (r) {
        yt(e, e.return, r);
      }
    }
  }
  function Mh(e, t, l) {
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
  function Ah(e) {
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
  function jf(e, t, l) {
    try {
      var r = e.stateNode;
      Qw(r, e.type, l, t), r[un] = t;
    } catch (s) {
      yt(e, e.return, s);
    }
  }
  function zh(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && mo(e.type) || e.tag === 4;
  }
  function kf(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || zh(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && mo(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function _f(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? (l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l).insertBefore(e, t) : (t = l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, t.appendChild(e), l = l._reactRootContainer, l != null || t.onclick !== null || (t.onclick = bl));
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode, t = null), e = e.child, e !== null))
      for (_f(e, t, l), e = e.sibling; e !== null; )
        _f(e, t, l), e = e.sibling;
  }
  function gs(e, t, l) {
    var r = e.tag;
    if (r === 5 || r === 6)
      e = e.stateNode, t ? l.insertBefore(e, t) : l.appendChild(e);
    else if (r !== 4 && (r === 27 && mo(e.type) && (l = e.stateNode), e = e.child, e !== null))
      for (gs(e, t, l), e = e.sibling; e !== null; )
        gs(e, t, l), e = e.sibling;
  }
  function Dh(e) {
    var t = e.stateNode, l = e.memoizedProps;
    try {
      for (var r = e.type, s = t.attributes; s.length; )
        t.removeAttributeNode(s[0]);
      pn(t, r, l), t[Ct] = e, t[un] = l;
    } catch (u) {
      yt(e, e.return, u);
    }
  }
  var Al = !1, $t = !1, Hf = !1, Nh = typeof WeakSet == "function" ? WeakSet : Set, on = null;
  function Mw(e, t) {
    if (e = e.containerInfo, ld = _s, e = Gg(e), Mc(e)) {
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
            var s = r.anchorOffset, u = r.focusNode;
            r = r.focusOffset;
            try {
              l.nodeType, u.nodeType;
            } catch {
              l = null;
              break e;
            }
            var h = 0, C = -1, L = -1, W = 0, ue = 0, de = e, ee = null;
            t: for (; ; ) {
              for (var le; de !== l || s !== 0 && de.nodeType !== 3 || (C = h + s), de !== u || r !== 0 && de.nodeType !== 3 || (L = h + r), de.nodeType === 3 && (h += de.nodeValue.length), (le = de.firstChild) !== null; )
                ee = de, de = le;
              for (; ; ) {
                if (de === e) break t;
                if (ee === l && ++W === s && (C = h), ee === u && ++ue === r && (L = h), (le = de.nextSibling) !== null) break;
                de = ee, ee = de.parentNode;
              }
              de = le;
            }
            l = C === -1 || L === -1 ? null : { start: C, end: L };
          } else l = null;
        }
      l = l || { start: 0, end: 0 };
    } else l = null;
    for (od = { focusedElem: e, selectionRange: l }, _s = !1, on = t; on !== null; )
      if (t = on, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null)
        e.return = t, on = e;
      else
        for (; on !== null; ) {
          switch (t = on, u = t.alternate, e = t.flags, t.tag) {
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
                e = void 0, l = t, s = u.memoizedProps, u = u.memoizedState, r = l.stateNode;
                try {
                  var De = Qo(
                    l.type,
                    s
                  );
                  e = r.getSnapshotBeforeUpdate(
                    De,
                    u
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
                  id(e);
                else if (l === 1)
                  switch (e.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      id(e);
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
  function jh(e, t, l) {
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
        r & 64 && Oh(l), r & 512 && Ua(l, l.return);
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
            ym(e, t);
          } catch (h) {
            yt(l, l.return, h);
          }
        }
        break;
      case 27:
        t === null && r & 4 && Dh(l);
      case 26:
      case 5:
        Dl(e, l), t === null && r & 4 && Ah(l), r & 512 && Ua(l, l.return);
        break;
      case 12:
        Dl(e, l);
        break;
      case 31:
        Dl(e, l), r & 4 && Hh(e, l);
        break;
      case 13:
        Dl(e, l), r & 4 && Uh(e, l), r & 64 && (e = l.memoizedState, e !== null && (e = e.dehydrated, e !== null && (l = Uw.bind(
          null,
          l
        ), l1(e, l))));
        break;
      case 22:
        if (r = l.memoizedState !== null || Al, !r) {
          t = t !== null && t.memoizedState !== null || $t, s = Al;
          var u = $t;
          Al = r, ($t = t) && !u ? Nl(
            e,
            l,
            (l.subtreeFlags & 8772) !== 0
          ) : Dl(e, l), Al = s, $t = u;
        }
        break;
      case 30:
        break;
      default:
        Dl(e, l);
    }
  }
  function kh(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, kh(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && fc(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var Lt = null, En = !1;
  function zl(e, t, l) {
    for (l = l.child; l !== null; )
      _h(e, t, l), l = l.sibling;
  }
  function _h(e, t, l) {
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
        ), Xa(l.stateNode), Lt = r, En = s;
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
            } catch (u) {
              yt(
                l,
                t,
                u
              );
            }
          else
            try {
              Lt.removeChild(l.stateNode);
            } catch (u) {
              yt(
                l,
                t,
                u
              );
            }
        break;
      case 18:
        Lt !== null && (En ? (e = Lt, Oy(
          e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e,
          l.stateNode
        ), Kr(e)) : Oy(Lt, l.stateNode));
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
        $t || (sl(l, t), r = l.stateNode, typeof r.componentWillUnmount == "function" && Mh(
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
  function Hh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Kr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
    }
  }
  function Uh(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null))))
      try {
        Kr(e);
      } catch (l) {
        yt(t, t.return, l);
      }
  }
  function Aw(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Nh()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Nh()), t;
      default:
        throw Error(i(435, e.tag));
    }
  }
  function ms(e, t) {
    var l = Aw(e);
    t.forEach(function(r) {
      if (!l.has(r)) {
        l.add(r);
        var s = Lw.bind(null, e, r);
        r.then(s, s);
      }
    });
  }
  function Tn(e, t) {
    var l = t.deletions;
    if (l !== null)
      for (var r = 0; r < l.length; r++) {
        var s = l[r], u = e, h = t, C = h;
        e: for (; C !== null; ) {
          switch (C.tag) {
            case 27:
              if (mo(C.type)) {
                Lt = C.stateNode, En = !1;
                break e;
              }
              break;
            case 5:
              Lt = C.stateNode, En = !1;
              break e;
            case 3:
            case 4:
              Lt = C.stateNode.containerInfo, En = !0;
              break e;
          }
          C = C.return;
        }
        if (Lt === null) throw Error(i(160));
        _h(u, h, s), Lt = null, En = !1, u = s.alternate, u !== null && (u.return = null), s.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        Lh(t, e), t = t.sibling;
  }
  var ll = null;
  function Lh(e, t) {
    var l = e.alternate, r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Tn(t, e), Rn(e), r & 4 && (io(3, e, e.return), Ha(3, e), io(5, e, e.return));
        break;
      case 1:
        Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), r & 64 && Al && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (l = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = l === null ? r : l.concat(r))));
        break;
      case 26:
        var s = ll;
        if (Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), r & 4) {
          var u = l !== null ? l.memoizedState : null;
          if (r = e.memoizedState, l === null)
            if (r === null)
              if (e.stateNode === null) {
                e: {
                  r = e.type, l = e.memoizedProps, s = s.ownerDocument || s;
                  t: switch (r) {
                    case "title":
                      u = s.getElementsByTagName("title")[0], (!u || u[ca] || u[Ct] || u.namespaceURI === "http://www.w3.org/2000/svg" || u.hasAttribute("itemprop")) && (u = s.createElement(r), s.head.insertBefore(
                        u,
                        s.querySelector("head > title")
                      )), pn(u, r, l), u[Ct] = e, ln(u), r = u;
                      break e;
                    case "link":
                      var h = Ly(
                        "link",
                        "href",
                        s
                      ).get(r + (l.href || ""));
                      if (h) {
                        for (var C = 0; C < h.length; C++)
                          if (u = h[C], u.getAttribute("href") === (l.href == null || l.href === "" ? null : l.href) && u.getAttribute("rel") === (l.rel == null ? null : l.rel) && u.getAttribute("title") === (l.title == null ? null : l.title) && u.getAttribute("crossorigin") === (l.crossOrigin == null ? null : l.crossOrigin)) {
                            h.splice(C, 1);
                            break t;
                          }
                      }
                      u = s.createElement(r), pn(u, r, l), s.head.appendChild(u);
                      break;
                    case "meta":
                      if (h = Ly(
                        "meta",
                        "content",
                        s
                      ).get(r + (l.content || ""))) {
                        for (C = 0; C < h.length; C++)
                          if (u = h[C], u.getAttribute("content") === (l.content == null ? null : "" + l.content) && u.getAttribute("name") === (l.name == null ? null : l.name) && u.getAttribute("property") === (l.property == null ? null : l.property) && u.getAttribute("http-equiv") === (l.httpEquiv == null ? null : l.httpEquiv) && u.getAttribute("charset") === (l.charSet == null ? null : l.charSet)) {
                            h.splice(C, 1);
                            break t;
                          }
                      }
                      u = s.createElement(r), pn(u, r, l), s.head.appendChild(u);
                      break;
                    default:
                      throw Error(i(468, r));
                  }
                  u[Ct] = e, ln(u), r = u;
                }
                e.stateNode = r;
              } else
                Iy(
                  s,
                  e.type,
                  e.stateNode
                );
            else
              e.stateNode = Uy(
                s,
                r,
                e.memoizedProps
              );
          else
            u !== r ? (u === null ? l.stateNode !== null && (l = l.stateNode, l.parentNode.removeChild(l)) : u.count--, r === null ? Iy(
              s,
              e.type,
              e.stateNode
            ) : Uy(
              s,
              r,
              e.memoizedProps
            )) : r === null && e.stateNode !== null && jf(
              e,
              e.memoizedProps,
              l.memoizedProps
            );
        }
        break;
      case 27:
        Tn(t, e), Rn(e), r & 512 && ($t || l === null || sl(l, l.return)), l !== null && r & 4 && jf(
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
        r & 4 && e.stateNode != null && (s = e.memoizedProps, jf(
          e,
          s,
          l !== null ? l.memoizedProps : s
        )), r & 1024 && (Hf = !0);
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
        Hf && (Hf = !1, Ih(e));
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
        var L = l !== null && l.memoizedState !== null, W = Al, ue = $t;
        if (Al = W || s, $t = ue || L, Tn(t, e), $t = ue, Al = W, Rn(e), r & 8192)
          e: for (t = e.stateNode, t._visibility = s ? t._visibility & -2 : t._visibility | 1, s && (l === null || L || Al || $t || Zo(e)), l = null, t = e; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (l === null) {
                L = l = t;
                try {
                  if (u = L.stateNode, s)
                    h = u.style, typeof h.setProperty == "function" ? h.setProperty("display", "none", "important") : h.display = "none";
                  else {
                    C = L.stateNode;
                    var de = L.memoizedProps.style, ee = de != null && de.hasOwnProperty("display") ? de.display : null;
                    C.style.display = ee == null || typeof ee == "boolean" ? "" : ("" + ee).trim();
                  }
                } catch (De) {
                  yt(L, L.return, De);
                }
              }
            } else if (t.tag === 6) {
              if (l === null) {
                L = t;
                try {
                  L.stateNode.nodeValue = s ? "" : L.memoizedProps;
                } catch (De) {
                  yt(L, L.return, De);
                }
              }
            } else if (t.tag === 18) {
              if (l === null) {
                L = t;
                try {
                  var le = L.stateNode;
                  s ? My(le, !0) : My(L.stateNode, !1);
                } catch (De) {
                  yt(L, L.return, De);
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
          if (zh(r)) {
            l = r;
            break;
          }
          r = r.return;
        }
        if (l == null) throw Error(i(160));
        switch (l.tag) {
          case 27:
            var s = l.stateNode, u = kf(e);
            gs(e, u, s);
            break;
          case 5:
            var h = l.stateNode;
            l.flags & 32 && (yr(h, ""), l.flags &= -33);
            var C = kf(e);
            gs(e, C, h);
            break;
          case 3:
          case 4:
            var L = l.stateNode.containerInfo, W = kf(e);
            _f(
              e,
              W,
              L
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
  function Ih(e) {
    if (e.subtreeFlags & 1024)
      for (e = e.child; e !== null; ) {
        var t = e;
        Ih(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
      }
  }
  function Dl(e, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        jh(e, t.alternate, t), t = t.sibling;
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
          typeof l.componentWillUnmount == "function" && Mh(
            t,
            t.return,
            l
          ), Zo(t);
          break;
        case 27:
          Xa(t.stateNode);
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
      var r = t.alternate, s = e, u = t, h = u.flags;
      switch (u.tag) {
        case 0:
        case 11:
        case 15:
          Nl(
            s,
            u,
            l
          ), Ha(4, u);
          break;
        case 1:
          if (Nl(
            s,
            u,
            l
          ), r = u, s = r.stateNode, typeof s.componentDidMount == "function")
            try {
              s.componentDidMount();
            } catch (W) {
              yt(r, r.return, W);
            }
          if (r = u, s = r.updateQueue, s !== null) {
            var C = r.stateNode;
            try {
              var L = s.shared.hiddenCallbacks;
              if (L !== null)
                for (s.shared.hiddenCallbacks = null, s = 0; s < L.length; s++)
                  hm(L[s], C);
            } catch (W) {
              yt(r, r.return, W);
            }
          }
          l && h & 64 && Oh(u), Ua(u, u.return);
          break;
        case 27:
          Dh(u);
        case 26:
        case 5:
          Nl(
            s,
            u,
            l
          ), l && r === null && h & 4 && Ah(u), Ua(u, u.return);
          break;
        case 12:
          Nl(
            s,
            u,
            l
          );
          break;
        case 31:
          Nl(
            s,
            u,
            l
          ), l && h & 4 && Hh(s, u);
          break;
        case 13:
          Nl(
            s,
            u,
            l
          ), l && h & 4 && Uh(s, u);
          break;
        case 22:
          u.memoizedState === null && Nl(
            s,
            u,
            l
          ), Ua(u, u.return);
          break;
        case 30:
          break;
        default:
          Nl(
            s,
            u,
            l
          );
      }
      t = t.sibling;
    }
  }
  function Uf(e, t) {
    var l = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (l = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== l && (e != null && e.refCount++, l != null && Ea(l));
  }
  function Lf(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ea(e));
  }
  function ol(e, t, l, r) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        Bh(
          e,
          t,
          l,
          r
        ), t = t.sibling;
  }
  function Bh(e, t, l, r) {
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
            var u = t.memoizedProps, h = u.id, C = u.onPostCommit;
            typeof C == "function" && C(
              h,
              t.alternate === null ? "mount" : "update",
              e.passiveEffectDuration,
              -0
            );
          } catch (L) {
            yt(t, t.return, L);
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
        u = t.stateNode, h = t.alternate, t.memoizedState !== null ? u._visibility & 2 ? ol(
          e,
          t,
          l,
          r
        ) : La(e, t) : u._visibility & 2 ? ol(
          e,
          t,
          l,
          r
        ) : (u._visibility |= 2, Ur(
          e,
          t,
          l,
          r,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), s & 2048 && Uf(h, t);
        break;
      case 24:
        ol(
          e,
          t,
          l,
          r
        ), s & 2048 && Lf(t.alternate, t);
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
      var u = e, h = t, C = l, L = r, W = h.flags;
      switch (h.tag) {
        case 0:
        case 11:
        case 15:
          Ur(
            u,
            h,
            C,
            L,
            s
          ), Ha(8, h);
          break;
        case 23:
          break;
        case 22:
          var ue = h.stateNode;
          h.memoizedState !== null ? ue._visibility & 2 ? Ur(
            u,
            h,
            C,
            L,
            s
          ) : La(
            u,
            h
          ) : (ue._visibility |= 2, Ur(
            u,
            h,
            C,
            L,
            s
          )), s && W & 2048 && Uf(
            h.alternate,
            h
          );
          break;
        case 24:
          Ur(
            u,
            h,
            C,
            L,
            s
          ), s && W & 2048 && Lf(h.alternate, h);
          break;
        default:
          Ur(
            u,
            h,
            C,
            L,
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
            La(l, r), s & 2048 && Uf(
              r.alternate,
              r
            );
            break;
          case 24:
            La(l, r), s & 2048 && Lf(r.alternate, r);
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
        Vh(
          e,
          t,
          l
        ), e = e.sibling;
  }
  function Vh(e, t, l) {
    switch (e.tag) {
      case 26:
        Lr(
          e,
          t,
          l
        ), e.flags & Ia && e.memoizedState !== null && m1(
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
  function Ph(e) {
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
          on = r, Gh(
            r,
            e
          );
        }
      Ph(e);
    }
    if (e.subtreeFlags & 10256)
      for (e = e.child; e !== null; )
        Yh(e), e = e.sibling;
  }
  function Yh(e) {
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
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, hs(e)) : Ba(e);
        break;
      default:
        Ba(e);
    }
  }
  function hs(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null)
        for (var l = 0; l < t.length; l++) {
          var r = t[l];
          on = r, Gh(
            r,
            e
          );
        }
      Ph(e);
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
  function Gh(e, t) {
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
          Ea(l.memoizedState.cache);
      }
      if (r = l.child, r !== null) r.return = l, on = r;
      else
        e: for (l = e; on !== null; ) {
          r = on;
          var s = r.sibling, u = r.return;
          if (kh(r), r === l) {
            on = null;
            break e;
          }
          if (s !== null) {
            s.return = u, on = s;
            break e;
          }
          on = u;
        }
    }
  }
  var zw = {
    getCacheForType: function(e) {
      var t = fn(Qt), l = t.data.get(e);
      return l === void 0 && (l = e(), t.data.set(e, l)), l;
    },
    cacheSignal: function() {
      return fn(Qt).controller.signal;
    }
  }, Dw = typeof WeakMap == "function" ? WeakMap : Map, dt = 0, Ot = null, lt = null, at = 0, ht = 0, _n = null, so = !1, Ir = !1, If = !1, jl = 0, Vt = 0, uo = 0, Jo = 0, Bf = 0, Hn = 0, Br = 0, Va = null, Cn = null, Vf = !1, ys = 0, qh = 0, vs = 1 / 0, bs = null, co = null, en = 0, fo = null, Vr = null, kl = 0, Pf = 0, Yf = null, Xh = null, Pa = 0, Gf = null;
  function Un() {
    return (dt & 2) !== 0 && at !== 0 ? at & -at : _.T !== null ? Zf() : Xt();
  }
  function Fh() {
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
    )), ul(e));
  }
  function Kh(e, t, l) {
    if ((dt & 6) !== 0) throw Error(i(327));
    var r = !l && (t & 127) === 0 && (t & e.expiredLanes) === 0 || Gt(e, t), s = r ? kw(e, t) : Xf(e, t, !0), u = r;
    do {
      if (s === 0) {
        Ir && !r && po(e, t, 0, !1);
        break;
      } else {
        if (l = e.current.alternate, u && !Nw(l)) {
          s = Xf(e, t, !1), u = !1;
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
              var C = e;
              s = Va;
              var L = C.current.memoizedState.isDehydrated;
              if (L && (Pr(C, h).flags |= 256), h = Xf(
                C,
                h,
                !1
              ), h !== 2) {
                if (If && !L) {
                  C.errorRecoveryDisabledLanes |= u, Jo |= u, s = 4;
                  break e;
                }
                u = Cn, Cn = s, u !== null && (Cn === null ? Cn = u : Cn.push.apply(
                  Cn,
                  u
                ));
              }
              s = h;
            }
            if (u = !1, s !== 2) continue;
          }
        }
        if (s === 1) {
          Pr(e, 0), po(e, t, 0, !0);
          break;
        }
        e: {
          switch (r = e, u = s, u) {
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
            ), Nt(r, 0, !0) !== 0) break e;
            kl = t, r.timeoutHandle = Ry(
              Qh.bind(
                null,
                r,
                l,
                Cn,
                bs,
                Vf,
                t,
                Hn,
                Jo,
                Br,
                so,
                u,
                "Throttled",
                -0,
                0
              ),
              s
            );
            break e;
          }
          Qh(
            r,
            l,
            Cn,
            bs,
            Vf,
            t,
            Hn,
            Jo,
            Br,
            so,
            u,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    ul(e);
  }
  function Qh(e, t, l, r, s, u, h, C, L, W, ue, de, ee, le) {
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
      }, Vh(
        t,
        u,
        de
      );
      var De = (u & 62914560) === u ? ys - ae() : (u & 4194048) === u ? qh - ae() : 0;
      if (De = h1(
        de,
        De
      ), De !== null) {
        kl = u, e.cancelPendingCommit = De(
          ly.bind(
            null,
            e,
            t,
            u,
            l,
            r,
            s,
            h,
            C,
            L,
            ue,
            de,
            null,
            ee,
            le
          )
        ), po(e, u, h, !W);
        return;
      }
    }
    ly(
      e,
      t,
      u,
      l,
      r,
      s,
      h,
      C,
      L
    );
  }
  function Nw(e) {
    for (var t = e; ; ) {
      var l = t.tag;
      if ((l === 0 || l === 11 || l === 15) && t.flags & 16384 && (l = t.updateQueue, l !== null && (l = l.stores, l !== null)))
        for (var r = 0; r < l.length; r++) {
          var s = l[r], u = s.getSnapshot;
          s = s.value;
          try {
            if (!Dn(u(), s)) return !1;
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
    t &= ~Bf, t &= ~Jo, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
    for (var s = t; 0 < s; ) {
      var u = 31 - mt(s), h = 1 << u;
      r[u] = -1, s &= ~h;
    }
    l !== 0 && hl(e, l, t);
  }
  function xs() {
    return (dt & 6) === 0 ? (Ya(0), !1) : !0;
  }
  function qf() {
    if (lt !== null) {
      if (ht === 0)
        var e = lt.return;
      else
        e = lt, El = Po = null, af(e), Nr = null, Ra = 0, e = lt;
      for (; e !== null; )
        Ch(e.alternate, e), e = e.return;
      lt = null;
    }
  }
  function Pr(e, t) {
    var l = e.timeoutHandle;
    l !== -1 && (e.timeoutHandle = -1, $w(l)), l = e.cancelPendingCommit, l !== null && (e.cancelPendingCommit = null, l()), kl = 0, qf(), Ot = e, lt = l = Sl(e.current, null), at = t, ht = 0, _n = null, so = !1, Ir = Gt(e, t), If = !1, Br = Hn = Bf = Jo = uo = Vt = 0, Cn = Va = null, Vf = !1, (t & 8) !== 0 && (t |= t & 32);
    var r = e.entangledLanes;
    if (r !== 0)
      for (e = e.entanglements, r &= t; 0 < r; ) {
        var s = 31 - mt(r), u = 1 << s;
        t |= e[s], r &= ~u;
      }
    return jl = t, Vi(), l;
  }
  function Zh(e, t) {
    Xe = null, _.H = ja, t === Dr || t === Qi ? (t = dm(), ht = 3) : t === Kc ? (t = dm(), ht = 4) : ht = t === Ef ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, _n = t, lt === null && (Vt = 1, us(
      e,
      Xn(t, e.current)
    ));
  }
  function Jh() {
    var e = jn.current;
    return e === null ? !0 : (at & 4194048) === at ? Zn === null : (at & 62914560) === at || (at & 536870912) !== 0 ? e === Zn : !1;
  }
  function $h() {
    var e = _.H;
    return _.H = ja, e === null ? ja : e;
  }
  function Wh() {
    var e = _.A;
    return _.A = zw, e;
  }
  function Ss() {
    Vt = 4, so || (at & 4194048) !== at && jn.current !== null || (Ir = !0), (uo & 134217727) === 0 && (Jo & 134217727) === 0 || Ot === null || po(
      Ot,
      at,
      Hn,
      !1
    );
  }
  function Xf(e, t, l) {
    var r = dt;
    dt |= 2;
    var s = $h(), u = Wh();
    (Ot !== e || at !== t) && (bs = null, Pr(e, t)), t = !1;
    var h = Vt;
    e: do
      try {
        if (ht !== 0 && lt !== null) {
          var C = lt, L = _n;
          switch (ht) {
            case 8:
              qf(), h = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              jn.current === null && (t = !0);
              var W = ht;
              if (ht = 0, _n = null, Yr(e, C, L, W), l && Ir) {
                h = 0;
                break e;
              }
              break;
            default:
              W = ht, ht = 0, _n = null, Yr(e, C, L, W);
          }
        }
        jw(), h = Vt;
        break;
      } catch (ue) {
        Zh(e, ue);
      }
    while (!0);
    return t && e.shellSuspendCounter++, El = Po = null, dt = r, _.H = s, _.A = u, lt === null && (Ot = null, at = 0, Vi()), h;
  }
  function jw() {
    for (; lt !== null; ) ey(lt);
  }
  function kw(e, t) {
    var l = dt;
    dt |= 2;
    var r = $h(), s = Wh();
    Ot !== e || at !== t ? (bs = null, vs = ae() + 500, Pr(e, t)) : Ir = Gt(
      e,
      t
    );
    e: do
      try {
        if (ht !== 0 && lt !== null) {
          t = lt;
          var u = _n;
          t: switch (ht) {
            case 1:
              ht = 0, _n = null, Yr(e, t, u, 1);
              break;
            case 2:
            case 9:
              if (cm(u)) {
                ht = 0, _n = null, ty(t);
                break;
              }
              t = function() {
                ht !== 2 && ht !== 9 || Ot !== e || (ht = 7), ul(e);
              }, u.then(t, t);
              break e;
            case 3:
              ht = 7;
              break e;
            case 4:
              ht = 5;
              break e;
            case 7:
              cm(u) ? (ht = 0, _n = null, ty(t)) : (ht = 0, _n = null, Yr(e, t, u, 7));
              break;
            case 5:
              var h = null;
              switch (lt.tag) {
                case 26:
                  h = lt.memoizedState;
                case 5:
                case 27:
                  var C = lt;
                  if (h ? By(h) : C.stateNode.complete) {
                    ht = 0, _n = null;
                    var L = C.sibling;
                    if (L !== null) lt = L;
                    else {
                      var W = C.return;
                      W !== null ? (lt = W, ws(W)) : lt = null;
                    }
                    break t;
                  }
              }
              ht = 0, _n = null, Yr(e, t, u, 5);
              break;
            case 6:
              ht = 0, _n = null, Yr(e, t, u, 6);
              break;
            case 8:
              qf(), Vt = 6;
              break e;
            default:
              throw Error(i(462));
          }
        }
        _w();
        break;
      } catch (ue) {
        Zh(e, ue);
      }
    while (!0);
    return El = Po = null, _.H = r, _.A = s, dt = l, lt !== null ? 0 : (Ot = null, at = 0, Vi(), Vt);
  }
  function _w() {
    for (; lt !== null && !Oe(); )
      ey(lt);
  }
  function ey(e) {
    var t = Th(e.alternate, e, jl);
    e.memoizedProps = e.pendingProps, t === null ? ws(e) : lt = t;
  }
  function ty(e) {
    var t = e, l = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = vh(
          l,
          t,
          t.pendingProps,
          t.type,
          void 0,
          at
        );
        break;
      case 11:
        t = vh(
          l,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          at
        );
        break;
      case 5:
        af(t);
      default:
        Ch(l, t), t = lt = Wg(t, jl), t = Th(l, t, jl);
    }
    e.memoizedProps = e.pendingProps, t === null ? ws(e) : lt = t;
  }
  function Yr(e, t, l, r) {
    El = Po = null, af(t), Nr = null, Ra = 0;
    var s = t.return;
    try {
      if (Ew(
        e,
        s,
        t,
        l,
        at
      )) {
        Vt = 1, us(
          e,
          Xn(l, e.current)
        ), lt = null;
        return;
      }
    } catch (u) {
      if (s !== null) throw lt = s, u;
      Vt = 1, us(
        e,
        Xn(l, e.current)
      ), lt = null;
      return;
    }
    t.flags & 32768 ? (st || r === 1 ? e = !0 : Ir || (at & 536870912) !== 0 ? e = !1 : (so = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = jn.current, r !== null && r.tag === 13 && (r.flags |= 16384))), ny(t, e)) : ws(t);
  }
  function ws(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        ny(
          t,
          so
        );
        return;
      }
      e = t.return;
      var l = Cw(
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
  function ny(e, t) {
    do {
      var l = Ow(e.alternate, e);
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
  function ly(e, t, l, r, s, u, h, C, L) {
    e.cancelPendingCommit = null;
    do
      Es();
    while (en !== 0);
    if ((dt & 6) !== 0) throw Error(i(327));
    if (t !== null) {
      if (t === e.current) throw Error(i(177));
      if (u = t.lanes | t.childLanes, u |= jc, Pn(
        e,
        l,
        u,
        h,
        C,
        L
      ), e === Ot && (lt = Ot = null, at = 0), Vr = t, fo = e, kl = l, Pf = u, Yf = s, Xh = r, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Iw(be, function() {
        return sy(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || r) {
        r = _.T, _.T = null, s = Y.p, Y.p = 2, h = dt, dt |= 4;
        try {
          Mw(e, t, l);
        } finally {
          dt = h, Y.p = s, _.T = r;
        }
      }
      en = 1, oy(), ry(), ay();
    }
  }
  function oy() {
    if (en === 1) {
      en = 0;
      var e = fo, t = Vr, l = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || l) {
        l = _.T, _.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          Lh(t, e);
          var u = od, h = Gg(e.containerInfo), C = u.focusedElem, L = u.selectionRange;
          if (h !== C && C && C.ownerDocument && Yg(
            C.ownerDocument.documentElement,
            C
          )) {
            if (L !== null && Mc(C)) {
              var W = L.start, ue = L.end;
              if (ue === void 0 && (ue = W), "selectionStart" in C)
                C.selectionStart = W, C.selectionEnd = Math.min(
                  ue,
                  C.value.length
                );
              else {
                var de = C.ownerDocument || document, ee = de && de.defaultView || window;
                if (ee.getSelection) {
                  var le = ee.getSelection(), De = C.textContent.length, Ve = Math.min(L.start, De), Et = L.end === void 0 ? Ve : Math.min(L.end, De);
                  !le.extend && Ve > Et && (h = Et, Et = Ve, Ve = h);
                  var X = Pg(
                    C,
                    Ve
                  ), V = Pg(
                    C,
                    Et
                  );
                  if (X && V && (le.rangeCount !== 1 || le.anchorNode !== X.node || le.anchorOffset !== X.offset || le.focusNode !== V.node || le.focusOffset !== V.offset)) {
                    var $ = de.createRange();
                    $.setStart(X.node, X.offset), le.removeAllRanges(), Ve > Et ? (le.addRange($), le.extend(V.node, V.offset)) : ($.setEnd(V.node, V.offset), le.addRange($));
                  }
                }
              }
            }
            for (de = [], le = C; le = le.parentNode; )
              le.nodeType === 1 && de.push({
                element: le,
                left: le.scrollLeft,
                top: le.scrollTop
              });
            for (typeof C.focus == "function" && C.focus(), C = 0; C < de.length; C++) {
              var ce = de[C];
              ce.element.scrollLeft = ce.left, ce.element.scrollTop = ce.top;
            }
          }
          _s = !!ld, od = ld = null;
        } finally {
          dt = s, Y.p = r, _.T = l;
        }
      }
      e.current = t, en = 2;
    }
  }
  function ry() {
    if (en === 2) {
      en = 0;
      var e = fo, t = Vr, l = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || l) {
        l = _.T, _.T = null;
        var r = Y.p;
        Y.p = 2;
        var s = dt;
        dt |= 4;
        try {
          jh(e, t.alternate, t);
        } finally {
          dt = s, Y.p = r, _.T = l;
        }
      }
      en = 3;
    }
  }
  function ay() {
    if (en === 4 || en === 3) {
      en = 0, He();
      var e = fo, t = Vr, l = kl, r = Xh;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? en = 5 : (en = 0, Vr = fo = null, iy(e, e.pendingLanes));
      var s = e.pendingLanes;
      if (s === 0 && (co = null), xt(l), t = t.stateNode, gt && typeof gt.onCommitFiberRoot == "function")
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
          for (var u = e.onRecoverableError, h = 0; h < r.length; h++) {
            var C = r[h];
            u(C.value, {
              componentStack: C.stack
            });
          }
        } finally {
          _.T = t, Y.p = s;
        }
      }
      (kl & 3) !== 0 && Es(), ul(e), s = e.pendingLanes, (l & 261930) !== 0 && (s & 42) !== 0 ? e === Gf ? Pa++ : (Pa = 0, Gf = e) : Pa = 0, Ya(0);
    }
  }
  function iy(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ea(t)));
  }
  function Es() {
    return oy(), ry(), ay(), sy();
  }
  function sy() {
    if (en !== 5) return !1;
    var e = fo, t = Pf;
    Pf = 0;
    var l = xt(kl), r = _.T, s = Y.p;
    try {
      Y.p = 32 > l ? 32 : l, _.T = null, l = Yf, Yf = null;
      var u = fo, h = kl;
      if (en = 0, Vr = fo = null, kl = 0, (dt & 6) !== 0) throw Error(i(331));
      var C = dt;
      if (dt |= 4, Yh(u.current), Bh(
        u,
        u.current,
        h,
        l
      ), dt = C, Ya(0, !1), gt && typeof gt.onPostCommitFiberRoot == "function")
        try {
          gt.onPostCommitFiberRoot(et, u);
        } catch {
        }
      return !0;
    } finally {
      Y.p = s, _.T = r, iy(e, t);
    }
  }
  function uy(e, t, l) {
    t = Xn(l, t), t = wf(e.stateNode, t, 2), e = oo(e, t, 2), e !== null && (qt(e, 2), ul(e));
  }
  function yt(e, t, l) {
    if (e.tag === 3)
      uy(e, e, l);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          uy(
            t,
            e,
            l
          );
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (co === null || !co.has(r))) {
            e = Xn(l, e), l = ch(2), r = oo(t, l, 2), r !== null && (fh(
              l,
              r,
              t,
              e
            ), qt(r, 2), ul(r));
            break;
          }
        }
        t = t.return;
      }
  }
  function Ff(e, t, l) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new Dw();
      var s = /* @__PURE__ */ new Set();
      r.set(t, s);
    } else
      s = r.get(t), s === void 0 && (s = /* @__PURE__ */ new Set(), r.set(t, s));
    s.has(l) || (If = !0, s.add(l), e = Hw.bind(null, e, t, l), t.then(e, e));
  }
  function Hw(e, t, l) {
    var r = e.pingCache;
    r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & l, e.warmLanes &= ~l, Ot === e && (at & l) === l && (Vt === 4 || Vt === 3 && (at & 62914560) === at && 300 > ae() - ys ? (dt & 2) === 0 && Pr(e, 0) : Bf |= l, Br === at && (Br = 0)), ul(e);
  }
  function cy(e, t) {
    t === 0 && (t = zn()), e = Io(e, t), e !== null && (qt(e, t), ul(e));
  }
  function Uw(e) {
    var t = e.memoizedState, l = 0;
    t !== null && (l = t.retryLane), cy(e, l);
  }
  function Lw(e, t) {
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
    r !== null && r.delete(t), cy(e, l);
  }
  function Iw(e, t) {
    return Se(e, t);
  }
  var Ts = null, Gr = null, Kf = !1, Rs = !1, Qf = !1, go = 0;
  function ul(e) {
    e !== Gr && e.next === null && (Gr === null ? Ts = Gr = e : Gr = Gr.next = e), Rs = !0, Kf || (Kf = !0, Vw());
  }
  function Ya(e, t) {
    if (!Qf && Rs) {
      Qf = !0;
      do
        for (var l = !1, r = Ts; r !== null; ) {
          if (e !== 0) {
            var s = r.pendingLanes;
            if (s === 0) var u = 0;
            else {
              var h = r.suspendedLanes, C = r.pingedLanes;
              u = (1 << 31 - mt(42 | e) + 1) - 1, u &= s & ~(h & ~C), u = u & 201326741 ? u & 201326741 | 1 : u ? u | 2 : 0;
            }
            u !== 0 && (l = !0, gy(r, u));
          } else
            u = at, u = Nt(
              r,
              r === Ot ? u : 0,
              r.cancelPendingCommit !== null || r.timeoutHandle !== -1
            ), (u & 3) === 0 || Gt(r, u) || (l = !0, gy(r, u));
          r = r.next;
        }
      while (l);
      Qf = !1;
    }
  }
  function Bw() {
    fy();
  }
  function fy() {
    Rs = Kf = !1;
    var e = 0;
    go !== 0 && Jw() && (e = go);
    for (var t = ae(), l = null, r = Ts; r !== null; ) {
      var s = r.next, u = dy(r, t);
      u === 0 ? (r.next = null, l === null ? Ts = s : l.next = s, s === null && (Gr = l)) : (l = r, (e !== 0 || (u & 3) !== 0) && (Rs = !0)), r = s;
    }
    en !== 0 && en !== 5 || Ya(e), go !== 0 && (go = 0);
  }
  function dy(e, t) {
    for (var l = e.suspendedLanes, r = e.pingedLanes, s = e.expirationTimes, u = e.pendingLanes & -62914561; 0 < u; ) {
      var h = 31 - mt(u), C = 1 << h, L = s[h];
      L === -1 ? ((C & l) === 0 || (C & r) !== 0) && (s[h] = Sn(C, t)) : L <= t && (e.expiredLanes |= C), u &= ~C;
    }
    if (t = Ot, l = at, l = Nt(
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
      return r = py.bind(null, e), l = Se(l, r), e.callbackPriority = t, e.callbackNode = l, t;
    }
    return r !== null && r !== null && Te(r), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function py(e, t) {
    if (en !== 0 && en !== 5)
      return e.callbackNode = null, e.callbackPriority = 0, null;
    var l = e.callbackNode;
    if (Es() && e.callbackNode !== l)
      return null;
    var r = at;
    return r = Nt(
      e,
      e === Ot ? r : 0,
      e.cancelPendingCommit !== null || e.timeoutHandle !== -1
    ), r === 0 ? null : (Kh(e, r, t), dy(e, ae()), e.callbackNode != null && e.callbackNode === l ? py.bind(null, e) : null);
  }
  function gy(e, t) {
    if (Es()) return null;
    Kh(e, t, !0);
  }
  function Vw() {
    Ww(function() {
      (dt & 6) !== 0 ? Se(
        Ue,
        Bw
      ) : fy();
    });
  }
  function Zf() {
    if (go === 0) {
      var e = Ar;
      e === 0 && (e = ft, ft <<= 1, (ft & 261888) === 0 && (ft = 256)), go = e;
    }
    return go;
  }
  function my(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : ji("" + e);
  }
  function hy(e, t) {
    var l = t.ownerDocument.createElement("input");
    return l.name = t.name, l.value = t.value, e.id && l.setAttribute("form", e.id), t.parentNode.insertBefore(l, t), e = new FormData(e), l.parentNode.removeChild(l), e;
  }
  function Pw(e, t, l, r, s) {
    if (t === "submit" && l && l.stateNode === s) {
      var u = my(
        (s[un] || null).action
      ), h = r.submitter;
      h && (t = (t = h[un] || null) ? my(t.formAction) : h.getAttribute("formAction"), t !== null && (u = t, h = null));
      var C = new Ui(
        "action",
        "action",
        null,
        r,
        s
      );
      e.push({
        event: C,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (r.defaultPrevented) {
                if (go !== 0) {
                  var L = h ? hy(s, h) : new FormData(s);
                  hf(
                    l,
                    {
                      pending: !0,
                      data: L,
                      method: s.method,
                      action: u
                    },
                    null,
                    L
                  );
                }
              } else
                typeof u == "function" && (C.preventDefault(), L = h ? hy(s, h) : new FormData(s), hf(
                  l,
                  {
                    pending: !0,
                    data: L,
                    method: s.method,
                    action: u
                  },
                  u,
                  L
                ));
            },
            currentTarget: s
          }
        ]
      });
    }
  }
  for (var Jf = 0; Jf < Nc.length; Jf++) {
    var $f = Nc[Jf], Yw = $f.toLowerCase(), Gw = $f[0].toUpperCase() + $f.slice(1);
    nl(
      Yw,
      "on" + Gw
    );
  }
  nl(Fg, "onAnimationEnd"), nl(Kg, "onAnimationIteration"), nl(Qg, "onAnimationStart"), nl("dblclick", "onDoubleClick"), nl("focusin", "onFocus"), nl("focusout", "onBlur"), nl(aw, "onTransitionRun"), nl(iw, "onTransitionStart"), nl(sw, "onTransitionCancel"), nl(Zg, "onTransitionEnd"), mr("onMouseEnter", ["mouseout", "mouseover"]), mr("onMouseLeave", ["mouseout", "mouseover"]), mr("onPointerEnter", ["pointerout", "pointerover"]), mr("onPointerLeave", ["pointerout", "pointerover"]), _o(
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
  var Ga = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), qw = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Ga)
  );
  function yy(e, t) {
    t = (t & 4) !== 0;
    for (var l = 0; l < e.length; l++) {
      var r = e[l], s = r.event;
      r = r.listeners;
      e: {
        var u = void 0;
        if (t)
          for (var h = r.length - 1; 0 <= h; h--) {
            var C = r[h], L = C.instance, W = C.currentTarget;
            if (C = C.listener, L !== u && s.isPropagationStopped())
              break e;
            u = C, s.currentTarget = W;
            try {
              u(s);
            } catch (ue) {
              Bi(ue);
            }
            s.currentTarget = null, u = L;
          }
        else
          for (h = 0; h < r.length; h++) {
            if (C = r[h], L = C.instance, W = C.currentTarget, C = C.listener, L !== u && s.isPropagationStopped())
              break e;
            u = C, s.currentTarget = W;
            try {
              u(s);
            } catch (ue) {
              Bi(ue);
            }
            s.currentTarget = null, u = L;
          }
      }
    }
  }
  function ot(e, t) {
    var l = t[ua];
    l === void 0 && (l = t[ua] = /* @__PURE__ */ new Set());
    var r = e + "__bubble";
    l.has(r) || (vy(t, e, 2, !1), l.add(r));
  }
  function Wf(e, t, l) {
    var r = 0;
    t && (r |= 4), vy(
      l,
      e,
      r,
      t
    );
  }
  var Cs = "_reactListening" + Math.random().toString(36).slice(2);
  function ed(e) {
    if (!e[Cs]) {
      e[Cs] = !0, fg.forEach(function(l) {
        l !== "selectionchange" && (qw.has(l) || Wf(l, !1, e), Wf(l, !0, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[Cs] || (t[Cs] = !0, Wf("selectionchange", !1, t));
    }
  }
  function vy(e, t, l, r) {
    switch (Fy(t)) {
      case 2:
        var s = b1;
        break;
      case 8:
        s = x1;
        break;
      default:
        s = md;
    }
    l = s.bind(
      null,
      t,
      l,
      e
    ), s = void 0, !bc || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (s = !0), r ? s !== void 0 ? e.addEventListener(t, l, {
      capture: !0,
      passive: s
    }) : e.addEventListener(t, l, !0) : s !== void 0 ? e.addEventListener(t, l, {
      passive: s
    }) : e.addEventListener(t, l, !1);
  }
  function td(e, t, l, r, s) {
    var u = r;
    if ((t & 1) === 0 && (t & 2) === 0 && r !== null)
      e: for (; ; ) {
        if (r === null) return;
        var h = r.tag;
        if (h === 3 || h === 4) {
          var C = r.stateNode.containerInfo;
          if (C === s) break;
          if (h === 4)
            for (h = r.return; h !== null; ) {
              var L = h.tag;
              if ((L === 3 || L === 4) && h.stateNode.containerInfo === s)
                return;
              h = h.return;
            }
          for (; C !== null; ) {
            if (h = dr(C), h === null) return;
            if (L = h.tag, L === 5 || L === 6 || L === 26 || L === 27) {
              r = u = h;
              continue e;
            }
            C = C.parentNode;
          }
        }
        r = r.return;
      }
    Eg(function() {
      var W = u, ue = yc(l), de = [];
      e: {
        var ee = Jg.get(e);
        if (ee !== void 0) {
          var le = Ui, De = e;
          switch (e) {
            case "keypress":
              if (_i(l) === 0) break e;
            case "keydown":
            case "keyup":
              le = LS;
              break;
            case "focusin":
              De = "focus", le = Ec;
              break;
            case "focusout":
              De = "blur", le = Ec;
              break;
            case "beforeblur":
            case "afterblur":
              le = Ec;
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
              le = Cg;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              le = CS;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              le = VS;
              break;
            case Fg:
            case Kg:
            case Qg:
              le = AS;
              break;
            case Zg:
              le = YS;
              break;
            case "scroll":
            case "scrollend":
              le = TS;
              break;
            case "wheel":
              le = qS;
              break;
            case "copy":
            case "cut":
            case "paste":
              le = DS;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              le = Mg;
              break;
            case "toggle":
            case "beforetoggle":
              le = FS;
          }
          var Ve = (t & 4) !== 0, Et = !Ve && (e === "scroll" || e === "scrollend"), X = Ve ? ee !== null ? ee + "Capture" : null : ee;
          Ve = [];
          for (var V = W, $; V !== null; ) {
            var ce = V;
            if ($ = ce.stateNode, ce = ce.tag, ce !== 5 && ce !== 26 && ce !== 27 || $ === null || X === null || (ce = da(V, X), ce != null && Ve.push(
              qa(V, ce, $)
            )), Et) break;
            V = V.return;
          }
          0 < Ve.length && (ee = new le(
            ee,
            De,
            null,
            l,
            ue
          ), de.push({ event: ee, listeners: Ve }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (ee = e === "mouseover" || e === "pointerover", le = e === "mouseout" || e === "pointerout", ee && l !== hc && (De = l.relatedTarget || l.fromElement) && (dr(De) || De[rl]))
            break e;
          if ((le || ee) && (ee = ue.window === ue ? ue : (ee = ue.ownerDocument) ? ee.defaultView || ee.parentWindow : window, le ? (De = l.relatedTarget || l.toElement, le = W, De = De ? dr(De) : null, De !== null && (Et = f(De), Ve = De.tag, De !== Et || Ve !== 5 && Ve !== 27 && Ve !== 6) && (De = null)) : (le = null, De = W), le !== De)) {
            if (Ve = Cg, ce = "onMouseLeave", X = "onMouseEnter", V = "mouse", (e === "pointerout" || e === "pointerover") && (Ve = Mg, ce = "onPointerLeave", X = "onPointerEnter", V = "pointer"), Et = le == null ? ee : fa(le), $ = De == null ? ee : fa(De), ee = new Ve(
              ce,
              V + "leave",
              le,
              l,
              ue
            ), ee.target = Et, ee.relatedTarget = $, ce = null, dr(ue) === W && (Ve = new Ve(
              X,
              V + "enter",
              De,
              l,
              ue
            ), Ve.target = $, Ve.relatedTarget = Et, ce = Ve), Et = ce, le && De)
              t: {
                for (Ve = Xw, X = le, V = De, $ = 0, ce = X; ce; ce = Ve(ce))
                  $++;
                ce = 0;
                for (var Ie = V; Ie; Ie = Ve(Ie))
                  ce++;
                for (; 0 < $ - ce; )
                  X = Ve(X), $--;
                for (; 0 < ce - $; )
                  V = Ve(V), ce--;
                for (; $--; ) {
                  if (X === V || V !== null && X === V.alternate) {
                    Ve = X;
                    break t;
                  }
                  X = Ve(X), V = Ve(V);
                }
                Ve = null;
              }
            else Ve = null;
            le !== null && by(
              de,
              ee,
              le,
              Ve,
              !1
            ), De !== null && Et !== null && by(
              de,
              Et,
              De,
              Ve,
              !0
            );
          }
        }
        e: {
          if (ee = W ? fa(W) : window, le = ee.nodeName && ee.nodeName.toLowerCase(), le === "select" || le === "input" && ee.type === "file")
            var ut = Hg;
          else if (kg(ee))
            if (Ug)
              ut = lw;
            else {
              ut = tw;
              var Ne = ew;
            }
          else
            le = ee.nodeName, !le || le.toLowerCase() !== "input" || ee.type !== "checkbox" && ee.type !== "radio" ? W && mc(W.elementType) && (ut = Hg) : ut = nw;
          if (ut && (ut = ut(e, W))) {
            _g(
              de,
              ut,
              l,
              ue
            );
            break e;
          }
          Ne && Ne(e, ee, W), e === "focusout" && W && ee.type === "number" && W.memoizedProps.value != null && gc(ee, "number", ee.value);
        }
        switch (Ne = W ? fa(W) : window, e) {
          case "focusin":
            (kg(Ne) || Ne.contentEditable === "true") && (Sr = Ne, Ac = W, xa = null);
            break;
          case "focusout":
            xa = Ac = Sr = null;
            break;
          case "mousedown":
            zc = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            zc = !1, qg(de, l, ue);
            break;
          case "selectionchange":
            if (rw) break;
          case "keydown":
          case "keyup":
            qg(de, l, ue);
        }
        var Fe;
        if (Rc)
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
          xr ? Ng(e, l) && (it = "onCompositionEnd") : e === "keydown" && l.keyCode === 229 && (it = "onCompositionStart");
        it && (Ag && l.locale !== "ko" && (xr || it !== "onCompositionStart" ? it === "onCompositionEnd" && xr && (Fe = Tg()) : (Jl = ue, xc = "value" in Jl ? Jl.value : Jl.textContent, xr = !0)), Ne = Os(W, it), 0 < Ne.length && (it = new Og(
          it,
          e,
          null,
          l,
          ue
        ), de.push({ event: it, listeners: Ne }), Fe ? it.data = Fe : (Fe = jg(l), Fe !== null && (it.data = Fe)))), (Fe = QS ? ZS(e, l) : JS(e, l)) && (it = Os(W, "onBeforeInput"), 0 < it.length && (Ne = new Og(
          "onBeforeInput",
          "beforeinput",
          null,
          l,
          ue
        ), de.push({
          event: Ne,
          listeners: it
        }), Ne.data = Fe)), Pw(
          de,
          e,
          W,
          l,
          ue
        );
      }
      yy(de, t);
    });
  }
  function qa(e, t, l) {
    return {
      instance: e,
      listener: t,
      currentTarget: l
    };
  }
  function Os(e, t) {
    for (var l = t + "Capture", r = []; e !== null; ) {
      var s = e, u = s.stateNode;
      if (s = s.tag, s !== 5 && s !== 26 && s !== 27 || u === null || (s = da(e, l), s != null && r.unshift(
        qa(e, s, u)
      ), s = da(e, t), s != null && r.push(
        qa(e, s, u)
      )), e.tag === 3) return r;
      e = e.return;
    }
    return [];
  }
  function Xw(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function by(e, t, l, r, s) {
    for (var u = t._reactName, h = []; l !== null && l !== r; ) {
      var C = l, L = C.alternate, W = C.stateNode;
      if (C = C.tag, L !== null && L === r) break;
      C !== 5 && C !== 26 && C !== 27 || W === null || (L = W, s ? (W = da(l, u), W != null && h.unshift(
        qa(l, W, L)
      )) : s || (W = da(l, u), W != null && h.push(
        qa(l, W, L)
      ))), l = l.return;
    }
    h.length !== 0 && e.push({ event: t, listeners: h });
  }
  var Fw = /\r\n?/g, Kw = /\u0000|\uFFFD/g;
  function xy(e) {
    return (typeof e == "string" ? e : "" + e).replace(Fw, `
`).replace(Kw, "");
  }
  function Sy(e, t) {
    return t = xy(t), xy(e) === t;
  }
  function wt(e, t, l, r, s, u) {
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
        Sg(e, r, u);
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
          typeof u == "function" && (l === "formAction" ? (t !== "input" && wt(e, t, "name", s.name, s, null), wt(
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
        (!(2 < l.length) || l[0] !== "o" && l[0] !== "O" || l[1] !== "n" && l[1] !== "N") && (l = wS.get(l) || l, zi(e, l, r));
    }
  }
  function nd(e, t, l, r, s, u) {
    switch (l) {
      case "style":
        Sg(e, r, u);
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
        if (!dg.hasOwnProperty(l))
          e: {
            if (l[0] === "o" && l[1] === "n" && (s = l.endsWith("Capture"), t = l.slice(2, s ? l.length - 7 : void 0), u = e[un] || null, u = u != null ? u[l] : null, typeof u == "function" && e.removeEventListener(t, u, s), typeof r == "function")) {
              typeof u != "function" && u !== null && (l in e ? e[l] = null : e.hasAttribute(l) && e.removeAttribute(l)), e.addEventListener(t, r, s);
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
        var r = !1, s = !1, u;
        for (u in l)
          if (l.hasOwnProperty(u)) {
            var h = l[u];
            if (h != null)
              switch (u) {
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
                  wt(e, t, u, h, l, null);
              }
          }
        s && wt(e, t, "srcSet", l.srcSet, l, null), r && wt(e, t, "src", l.src, l, null);
        return;
      case "input":
        ot("invalid", e);
        var C = u = h = s = null, L = null, W = null;
        for (r in l)
          if (l.hasOwnProperty(r)) {
            var ue = l[r];
            if (ue != null)
              switch (r) {
                case "name":
                  s = ue;
                  break;
                case "type":
                  h = ue;
                  break;
                case "checked":
                  L = ue;
                  break;
                case "defaultChecked":
                  W = ue;
                  break;
                case "value":
                  u = ue;
                  break;
                case "defaultValue":
                  C = ue;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (ue != null)
                    throw Error(i(137, t));
                  break;
                default:
                  wt(e, t, r, ue, l, null);
              }
          }
        yg(
          e,
          u,
          C,
          L,
          W,
          h,
          s,
          !1
        );
        return;
      case "select":
        ot("invalid", e), r = h = u = null;
        for (s in l)
          if (l.hasOwnProperty(s) && (C = l[s], C != null))
            switch (s) {
              case "value":
                u = C;
                break;
              case "defaultValue":
                h = C;
                break;
              case "multiple":
                r = C;
              default:
                wt(e, t, s, C, l, null);
            }
        t = u, l = h, e.multiple = !!r, t != null ? hr(e, !!r, t, !1) : l != null && hr(e, !!r, l, !0);
        return;
      case "textarea":
        ot("invalid", e), u = s = r = null;
        for (h in l)
          if (l.hasOwnProperty(h) && (C = l[h], C != null))
            switch (h) {
              case "value":
                r = C;
                break;
              case "defaultValue":
                s = C;
                break;
              case "children":
                u = C;
                break;
              case "dangerouslySetInnerHTML":
                if (C != null) throw Error(i(91));
                break;
              default:
                wt(e, t, h, C, l, null);
            }
        bg(e, r, s, u);
        return;
      case "option":
        for (L in l)
          l.hasOwnProperty(L) && (r = l[L], r != null) && (L === "selected" ? e.selected = r && typeof r != "function" && typeof r != "symbol" : wt(e, t, L, r, l, null));
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
                wt(e, t, W, r, l, null);
            }
        return;
      default:
        if (mc(t)) {
          for (ue in l)
            l.hasOwnProperty(ue) && (r = l[ue], r !== void 0 && nd(
              e,
              t,
              ue,
              r,
              l,
              void 0
            ));
          return;
        }
    }
    for (C in l)
      l.hasOwnProperty(C) && (r = l[C], r != null && wt(e, t, C, r, l, null));
  }
  function Qw(e, t, l, r) {
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
        var s = null, u = null, h = null, C = null, L = null, W = null, ue = null;
        for (le in l) {
          var de = l[le];
          if (l.hasOwnProperty(le) && de != null)
            switch (le) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                L = de;
              default:
                r.hasOwnProperty(le) || wt(e, t, le, null, r, de);
            }
        }
        for (var ee in r) {
          var le = r[ee];
          if (de = l[ee], r.hasOwnProperty(ee) && (le != null || de != null))
            switch (ee) {
              case "type":
                u = le;
                break;
              case "name":
                s = le;
                break;
              case "checked":
                W = le;
                break;
              case "defaultChecked":
                ue = le;
                break;
              case "value":
                h = le;
                break;
              case "defaultValue":
                C = le;
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
                  ee,
                  le,
                  r,
                  de
                );
            }
        }
        pc(
          e,
          h,
          C,
          L,
          W,
          ue,
          u,
          s
        );
        return;
      case "select":
        le = h = C = ee = null;
        for (u in l)
          if (L = l[u], l.hasOwnProperty(u) && L != null)
            switch (u) {
              case "value":
                break;
              case "multiple":
                le = L;
              default:
                r.hasOwnProperty(u) || wt(
                  e,
                  t,
                  u,
                  null,
                  r,
                  L
                );
            }
        for (s in r)
          if (u = r[s], L = l[s], r.hasOwnProperty(s) && (u != null || L != null))
            switch (s) {
              case "value":
                ee = u;
                break;
              case "defaultValue":
                C = u;
                break;
              case "multiple":
                h = u;
              default:
                u !== L && wt(
                  e,
                  t,
                  s,
                  u,
                  r,
                  L
                );
            }
        t = C, l = h, r = le, ee != null ? hr(e, !!l, ee, !1) : !!r != !!l && (t != null ? hr(e, !!l, t, !0) : hr(e, !!l, l ? [] : "", !1));
        return;
      case "textarea":
        le = ee = null;
        for (C in l)
          if (s = l[C], l.hasOwnProperty(C) && s != null && !r.hasOwnProperty(C))
            switch (C) {
              case "value":
                break;
              case "children":
                break;
              default:
                wt(e, t, C, null, r, s);
            }
        for (h in r)
          if (s = r[h], u = l[h], r.hasOwnProperty(h) && (s != null || u != null))
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
                s !== u && wt(e, t, h, s, r, u);
            }
        vg(e, ee, le);
        return;
      case "option":
        for (var De in l)
          ee = l[De], l.hasOwnProperty(De) && ee != null && !r.hasOwnProperty(De) && (De === "selected" ? e.selected = !1 : wt(
            e,
            t,
            De,
            null,
            r,
            ee
          ));
        for (L in r)
          ee = r[L], le = l[L], r.hasOwnProperty(L) && ee !== le && (ee != null || le != null) && (L === "selected" ? e.selected = ee && typeof ee != "function" && typeof ee != "symbol" : wt(
            e,
            t,
            L,
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
          ee = l[Ve], l.hasOwnProperty(Ve) && ee != null && !r.hasOwnProperty(Ve) && wt(e, t, Ve, null, r, ee);
        for (W in r)
          if (ee = r[W], le = l[W], r.hasOwnProperty(W) && ee !== le && (ee != null || le != null))
            switch (W) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (ee != null)
                  throw Error(i(137, t));
                break;
              default:
                wt(
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
        if (mc(t)) {
          for (var Et in l)
            ee = l[Et], l.hasOwnProperty(Et) && ee !== void 0 && !r.hasOwnProperty(Et) && nd(
              e,
              t,
              Et,
              void 0,
              r,
              ee
            );
          for (ue in r)
            ee = r[ue], le = l[ue], !r.hasOwnProperty(ue) || ee === le || ee === void 0 && le === void 0 || nd(
              e,
              t,
              ue,
              ee,
              r,
              le
            );
          return;
        }
    }
    for (var X in l)
      ee = l[X], l.hasOwnProperty(X) && ee != null && !r.hasOwnProperty(X) && wt(e, t, X, null, r, ee);
    for (de in r)
      ee = r[de], le = l[de], !r.hasOwnProperty(de) || ee === le || ee == null && le == null || wt(e, t, de, ee, r, le);
  }
  function wy(e) {
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
  function Zw() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, l = performance.getEntriesByType("resource"), r = 0; r < l.length; r++) {
        var s = l[r], u = s.transferSize, h = s.initiatorType, C = s.duration;
        if (u && C && wy(h)) {
          for (h = 0, C = s.responseEnd, r += 1; r < l.length; r++) {
            var L = l[r], W = L.startTime;
            if (W > C) break;
            var ue = L.transferSize, de = L.initiatorType;
            ue && wy(de) && (L = L.responseEnd, h += ue * (L < C ? 1 : (C - W) / (L - W)));
          }
          if (--r, t += 8 * (u + h) / (s.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var ld = null, od = null;
  function Ms(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function Ey(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Ty(e, t) {
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
  function rd(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var ad = null;
  function Jw() {
    var e = window.event;
    return e && e.type === "popstate" ? e === ad ? !1 : (ad = e, !0) : (ad = null, !1);
  }
  var Ry = typeof setTimeout == "function" ? setTimeout : void 0, $w = typeof clearTimeout == "function" ? clearTimeout : void 0, Cy = typeof Promise == "function" ? Promise : void 0, Ww = typeof queueMicrotask == "function" ? queueMicrotask : typeof Cy < "u" ? function(e) {
    return Cy.resolve(null).then(e).catch(e1);
  } : Ry;
  function e1(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function mo(e) {
    return e === "head";
  }
  function Oy(e, t) {
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
          for (var u = l.firstChild; u; ) {
            var h = u.nextSibling, C = u.nodeName;
            u[ca] || C === "SCRIPT" || C === "STYLE" || C === "LINK" && u.rel.toLowerCase() === "stylesheet" || l.removeChild(u), u = h;
          }
        } else
          l === "body" && Xa(e.ownerDocument.body);
      l = s;
    } while (l);
    Kr(t);
  }
  function My(e, t) {
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
  function id(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var l = t;
      switch (t = t.nextSibling, l.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          id(l), fc(l);
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
  function t1(e, t, l, r) {
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
      if (e = Jn(e.nextSibling), e === null) break;
    }
    return null;
  }
  function n1(e, t, l) {
    if (t === "") return null;
    for (; e.nodeType !== 3; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !l || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function Ay(e, t) {
    for (; e.nodeType !== 8; )
      if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Jn(e.nextSibling), e === null)) return null;
    return e;
  }
  function sd(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function ud(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function l1(e, t) {
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
  var cd = null;
  function zy(e) {
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
  function Dy(e) {
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
  function Ny(e, t, l) {
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
  function Xa(e) {
    for (var t = e.attributes; t.length; )
      e.removeAttributeNode(t[0]);
    fc(e);
  }
  var $n = /* @__PURE__ */ new Map(), jy = /* @__PURE__ */ new Set();
  function As(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var _l = Y.d;
  Y.d = {
    f: o1,
    r: r1,
    D: a1,
    C: i1,
    L: s1,
    m: u1,
    X: f1,
    S: c1,
    M: d1
  };
  function o1() {
    var e = _l.f(), t = xs();
    return e || t;
  }
  function r1(e) {
    var t = pr(e);
    t !== null && t.tag === 5 && t.type === "form" ? Zm(t) : _l.r(e);
  }
  var qr = typeof document > "u" ? null : document;
  function ky(e, t, l) {
    var r = qr;
    if (r && typeof t == "string" && t) {
      var s = Gn(t);
      s = 'link[rel="' + e + '"][href="' + s + '"]', typeof l == "string" && (s += '[crossorigin="' + l + '"]'), jy.has(s) || (jy.add(s), e = { rel: e, crossOrigin: l, href: t }, r.querySelector(s) === null && (t = r.createElement("link"), pn(t, "link", e), ln(t), r.head.appendChild(t)));
    }
  }
  function a1(e) {
    _l.D(e), ky("dns-prefetch", e, null);
  }
  function i1(e, t) {
    _l.C(e, t), ky("preconnect", e, t);
  }
  function s1(e, t, l) {
    _l.L(e, t, l);
    var r = qr;
    if (r && e && t) {
      var s = 'link[rel="preload"][as="' + Gn(t) + '"]';
      t === "image" && l && l.imageSrcSet ? (s += '[imagesrcset="' + Gn(
        l.imageSrcSet
      ) + '"]', typeof l.imageSizes == "string" && (s += '[imagesizes="' + Gn(
        l.imageSizes
      ) + '"]')) : s += '[href="' + Gn(e) + '"]';
      var u = s;
      switch (t) {
        case "style":
          u = Xr(e);
          break;
        case "script":
          u = Fr(e);
      }
      $n.has(u) || (e = b(
        {
          rel: "preload",
          href: t === "image" && l && l.imageSrcSet ? void 0 : e,
          as: t
        },
        l
      ), $n.set(u, e), r.querySelector(s) !== null || t === "style" && r.querySelector(Fa(u)) || t === "script" && r.querySelector(Ka(u)) || (t = r.createElement("link"), pn(t, "link", e), ln(t), r.head.appendChild(t)));
    }
  }
  function u1(e, t) {
    _l.m(e, t);
    var l = qr;
    if (l && e) {
      var r = t && typeof t.as == "string" ? t.as : "script", s = 'link[rel="modulepreload"][as="' + Gn(r) + '"][href="' + Gn(e) + '"]', u = s;
      switch (r) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          u = Fr(e);
      }
      if (!$n.has(u) && (e = b({ rel: "modulepreload", href: e }, t), $n.set(u, e), l.querySelector(s) === null)) {
        switch (r) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (l.querySelector(Ka(u)))
              return;
        }
        r = l.createElement("link"), pn(r, "link", e), ln(r), l.head.appendChild(r);
      }
    }
  }
  function c1(e, t, l) {
    _l.S(e, t, l);
    var r = qr;
    if (r && e) {
      var s = gr(r).hoistableStyles, u = Xr(e);
      t = t || "default";
      var h = s.get(u);
      if (!h) {
        var C = { loading: 0, preload: null };
        if (h = r.querySelector(
          Fa(u)
        ))
          C.loading = 5;
        else {
          e = b(
            { rel: "stylesheet", href: e, "data-precedence": t },
            l
          ), (l = $n.get(u)) && fd(e, l);
          var L = h = r.createElement("link");
          ln(L), pn(L, "link", e), L._p = new Promise(function(W, ue) {
            L.onload = W, L.onerror = ue;
          }), L.addEventListener("load", function() {
            C.loading |= 1;
          }), L.addEventListener("error", function() {
            C.loading |= 2;
          }), C.loading |= 4, zs(h, t, r);
        }
        h = {
          type: "stylesheet",
          instance: h,
          count: 1,
          state: C
        }, s.set(u, h);
      }
    }
  }
  function f1(e, t) {
    _l.X(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), u = r.get(s);
      u || (u = l.querySelector(Ka(s)), u || (e = b({ src: e, async: !0 }, t), (t = $n.get(s)) && dd(e, t), u = l.createElement("script"), ln(u), pn(u, "link", e), l.head.appendChild(u)), u = {
        type: "script",
        instance: u,
        count: 1,
        state: null
      }, r.set(s, u));
    }
  }
  function d1(e, t) {
    _l.M(e, t);
    var l = qr;
    if (l && e) {
      var r = gr(l).hoistableScripts, s = Fr(e), u = r.get(s);
      u || (u = l.querySelector(Ka(s)), u || (e = b({ src: e, async: !0, type: "module" }, t), (t = $n.get(s)) && dd(e, t), u = l.createElement("script"), ln(u), pn(u, "link", e), l.head.appendChild(u)), u = {
        type: "script",
        instance: u,
        count: 1,
        state: null
      }, r.set(s, u));
    }
  }
  function _y(e, t, l, r) {
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
          var u = gr(
            s
          ).hoistableStyles, h = u.get(e);
          if (h || (s = s.ownerDocument || s, h = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, u.set(e, h), (u = s.querySelector(
            Fa(e)
          )) && !u._p && (h.instance = u, h.state.loading = 5), $n.has(e) || (l = {
            rel: "preload",
            as: "style",
            href: l.href,
            crossOrigin: l.crossOrigin,
            integrity: l.integrity,
            media: l.media,
            hrefLang: l.hrefLang,
            referrerPolicy: l.referrerPolicy
          }, $n.set(e, l), u || p1(
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
  function Hy(e) {
    return b({}, e, {
      "data-precedence": e.precedence,
      precedence: null
    });
  }
  function p1(e, t, l, r) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
      return r.loading |= 1;
    }), t.addEventListener("error", function() {
      return r.loading |= 2;
    }), pn(t, "link", l), ln(t), e.head.appendChild(t));
  }
  function Fr(e) {
    return '[src="' + Gn(e) + '"]';
  }
  function Ka(e) {
    return "script[async]" + e;
  }
  function Uy(e, t, l) {
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
          var u = e.querySelector(
            Fa(s)
          );
          if (u)
            return t.state.loading |= 4, t.instance = u, ln(u), u;
          r = Hy(l), (s = $n.get(s)) && fd(r, s), u = (e.ownerDocument || e).createElement("link"), ln(u);
          var h = u;
          return h._p = new Promise(function(C, L) {
            h.onload = C, h.onerror = L;
          }), pn(u, "link", r), t.state.loading |= 4, zs(u, l.precedence, e), t.instance = u;
        case "script":
          return u = Fr(l.src), (s = e.querySelector(
            Ka(u)
          )) ? (t.instance = s, ln(s), s) : (r = l, (s = $n.get(u)) && (r = b({}, l), dd(r, s)), e = e.ownerDocument || e, s = e.createElement("script"), ln(s), pn(s, "link", r), e.head.appendChild(s), t.instance = s);
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
    ), s = r.length ? r[r.length - 1] : null, u = s, h = 0; h < r.length; h++) {
      var C = r[h];
      if (C.dataset.precedence === t) u = C;
      else if (u !== s) break;
    }
    u ? u.parentNode.insertBefore(e, u.nextSibling) : (t = l.nodeType === 9 ? l.head : l, t.insertBefore(e, t.firstChild));
  }
  function fd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function dd(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var Ds = null;
  function Ly(e, t, l) {
    if (Ds === null) {
      var r = /* @__PURE__ */ new Map(), s = Ds = /* @__PURE__ */ new Map();
      s.set(l, r);
    } else
      s = Ds, r = s.get(l), r || (r = /* @__PURE__ */ new Map(), s.set(l, r));
    if (r.has(e)) return r;
    for (r.set(e, null), l = l.getElementsByTagName(e), s = 0; s < l.length; s++) {
      var u = l[s];
      if (!(u[ca] || u[Ct] || e === "link" && u.getAttribute("rel") === "stylesheet") && u.namespaceURI !== "http://www.w3.org/2000/svg") {
        var h = u.getAttribute(t) || "";
        h = e + h;
        var C = r.get(h);
        C ? C.push(u) : r.set(h, [u]);
      }
    }
    return r;
  }
  function Iy(e, t, l) {
    e = e.ownerDocument || e, e.head.insertBefore(
      l,
      t === "title" ? e.querySelector("head > title") : null
    );
  }
  function g1(e, t, l) {
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
  function By(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function m1(e, t, l, r) {
    if (l.type === "stylesheet" && (typeof r.media != "string" || matchMedia(r.media).matches !== !1) && (l.state.loading & 4) === 0) {
      if (l.instance === null) {
        var s = Xr(r.href), u = t.querySelector(
          Fa(s)
        );
        if (u) {
          t = u._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Ns.bind(e), t.then(e, e)), l.state.loading |= 4, l.instance = u, ln(u);
          return;
        }
        u = t.ownerDocument || t, r = Hy(r), (s = $n.get(s)) && fd(r, s), u = u.createElement("link"), ln(u);
        var h = u;
        h._p = new Promise(function(C, L) {
          h.onload = C, h.onerror = L;
        }), pn(u, "link", r), l.instance = u;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(l, t), (t = l.state.preload) && (l.state.loading & 3) === 0 && (e.count++, l = Ns.bind(e), t.addEventListener("load", l), t.addEventListener("error", l));
    }
  }
  var pd = 0;
  function h1(e, t) {
    return e.stylesheets && e.count === 0 && ks(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(l) {
      var r = setTimeout(function() {
        if (e.stylesheets && ks(e, e.stylesheets), e.unsuspend) {
          var u = e.unsuspend;
          e.unsuspend = null, u();
        }
      }, 6e4 + t);
      0 < e.imgBytes && pd === 0 && (pd = 62500 * Zw());
      var s = setTimeout(
        function() {
          if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && ks(e, e.stylesheets), e.unsuspend)) {
            var u = e.unsuspend;
            e.unsuspend = null, u();
          }
        },
        (e.imgBytes > pd ? 50 : 800) + t
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
    e.stylesheets = null, e.unsuspend !== null && (e.count++, js = /* @__PURE__ */ new Map(), t.forEach(y1, e), js = null, Ns.call(e));
  }
  function y1(e, t) {
    if (!(t.state.loading & 4)) {
      var l = js.get(e);
      if (l) var r = l.get(null);
      else {
        l = /* @__PURE__ */ new Map(), js.set(e, l);
        for (var s = e.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), u = 0; u < s.length; u++) {
          var h = s[u];
          (h.nodeName === "LINK" || h.getAttribute("media") !== "not all") && (l.set(h.dataset.precedence, h), r = h);
        }
        r && l.set(null, r);
      }
      s = t.instance, h = s.getAttribute("data-precedence"), u = l.get(h) || r, u === r && l.set(null, s), l.set(h, s), this.count++, r = Ns.bind(this), s.addEventListener("load", r), s.addEventListener("error", r), u ? u.parentNode.insertBefore(s, u.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(s, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Qa = {
    $$typeof: E,
    Provider: null,
    Consumer: null,
    _currentValue: B,
    _currentValue2: B,
    _threadCount: 0
  };
  function v1(e, t, l, r, s, u, h, C, L) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vn(0), this.hiddenUpdates = Vn(null), this.identifierPrefix = r, this.onUncaughtError = s, this.onCaughtError = u, this.onRecoverableError = h, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = L, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Vy(e, t, l, r, s, u, h, C, L, W, ue, de) {
    return e = new v1(
      e,
      t,
      l,
      h,
      L,
      W,
      ue,
      de,
      C
    ), t = 1, u === !0 && (t |= 24), u = Nn(3, null, null, t), e.current = u, u.stateNode = e, t = qc(), t.refCount++, e.pooledCache = t, t.refCount++, u.memoizedState = {
      element: r,
      isDehydrated: l,
      cache: t
    }, Qc(u), e;
  }
  function Py(e) {
    return e ? (e = Tr, e) : Tr;
  }
  function Yy(e, t, l, r, s, u) {
    s = Py(s), r.context === null ? r.context = s : r.pendingContext = s, r = lo(t), r.payload = { element: l }, u = u === void 0 ? null : u, u !== null && (r.callback = u), l = oo(e, r, t), l !== null && (On(l, e, t), Oa(l, e, t));
  }
  function Gy(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var l = e.retryLane;
      e.retryLane = l !== 0 && l < t ? l : t;
    }
  }
  function gd(e, t) {
    Gy(e, t), (e = e.alternate) && Gy(e, t);
  }
  function qy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Io(e, 67108864);
      t !== null && On(t, e, 67108864), gd(e, 67108864);
    }
  }
  function Xy(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = Un();
      t = qe(t);
      var l = Io(e, t);
      l !== null && On(l, e, t), gd(e, t);
    }
  }
  var _s = !0;
  function b1(e, t, l, r) {
    var s = _.T;
    _.T = null;
    var u = Y.p;
    try {
      Y.p = 2, md(e, t, l, r);
    } finally {
      Y.p = u, _.T = s;
    }
  }
  function x1(e, t, l, r) {
    var s = _.T;
    _.T = null;
    var u = Y.p;
    try {
      Y.p = 8, md(e, t, l, r);
    } finally {
      Y.p = u, _.T = s;
    }
  }
  function md(e, t, l, r) {
    if (_s) {
      var s = hd(r);
      if (s === null)
        td(
          e,
          t,
          r,
          Hs,
          l
        ), Ky(e, r);
      else if (w1(
        s,
        e,
        t,
        l,
        r
      ))
        r.stopPropagation();
      else if (Ky(e, r), t & 4 && -1 < S1.indexOf(e)) {
        for (; s !== null; ) {
          var u = pr(s);
          if (u !== null)
            switch (u.tag) {
              case 3:
                if (u = u.stateNode, u.current.memoizedState.isDehydrated) {
                  var h = Ut(u.pendingLanes);
                  if (h !== 0) {
                    var C = u;
                    for (C.pendingLanes |= 2, C.entangledLanes |= 2; h; ) {
                      var L = 1 << 31 - mt(h);
                      C.entanglements[1] |= L, h &= ~L;
                    }
                    ul(u), (dt & 6) === 0 && (vs = ae() + 500, Ya(0));
                  }
                }
                break;
              case 31:
              case 13:
                C = Io(u, 2), C !== null && On(C, u, 2), xs(), gd(u, 2);
            }
          if (u = hd(r), u === null && td(
            e,
            t,
            r,
            Hs,
            l
          ), u === s) break;
          s = u;
        }
        s !== null && r.stopPropagation();
      } else
        td(
          e,
          t,
          r,
          null,
          l
        );
    }
  }
  function hd(e) {
    return e = yc(e), yd(e);
  }
  var Hs = null;
  function yd(e) {
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
  function Fy(e) {
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
  var vd = !1, ho = null, yo = null, vo = null, Za = /* @__PURE__ */ new Map(), Ja = /* @__PURE__ */ new Map(), bo = [], S1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function Ky(e, t) {
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
  function $a(e, t, l, r, s, u) {
    return e === null || e.nativeEvent !== u ? (e = {
      blockedOn: t,
      domEventName: l,
      eventSystemFlags: r,
      nativeEvent: u,
      targetContainers: [s]
    }, t !== null && (t = pr(t), t !== null && qy(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, s !== null && t.indexOf(s) === -1 && t.push(s), e);
  }
  function w1(e, t, l, r, s) {
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
        var u = s.pointerId;
        return Za.set(
          u,
          $a(
            Za.get(u) || null,
            e,
            t,
            l,
            r,
            s
          )
        ), !0;
      case "gotpointercapture":
        return u = s.pointerId, Ja.set(
          u,
          $a(
            Ja.get(u) || null,
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
  function Qy(e) {
    var t = dr(e.target);
    if (t !== null) {
      var l = f(t);
      if (l !== null) {
        if (t = l.tag, t === 13) {
          if (t = p(l), t !== null) {
            e.blockedOn = t, nn(e.priority, function() {
              Xy(l);
            });
            return;
          }
        } else if (t === 31) {
          if (t = g(l), t !== null) {
            e.blockedOn = t, nn(e.priority, function() {
              Xy(l);
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
      var l = hd(e.nativeEvent);
      if (l === null) {
        l = e.nativeEvent;
        var r = new l.constructor(
          l.type,
          l
        );
        hc = r, l.target.dispatchEvent(r), hc = null;
      } else
        return t = pr(l), t !== null && qy(t), e.blockedOn = l, !1;
      t.shift();
    }
    return !0;
  }
  function Zy(e, t, l) {
    Us(e) && l.delete(t);
  }
  function E1() {
    vd = !1, ho !== null && Us(ho) && (ho = null), yo !== null && Us(yo) && (yo = null), vo !== null && Us(vo) && (vo = null), Za.forEach(Zy), Ja.forEach(Zy);
  }
  function Ls(e, t) {
    e.blockedOn === t && (e.blockedOn = null, vd || (vd = !0, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      E1
    )));
  }
  var Is = null;
  function Jy(e) {
    Is !== e && (Is = e, n.unstable_scheduleCallback(
      n.unstable_NormalPriority,
      function() {
        Is === e && (Is = null);
        for (var t = 0; t < e.length; t += 3) {
          var l = e[t], r = e[t + 1], s = e[t + 2];
          if (typeof r != "function") {
            if (yd(r || l) === null)
              continue;
            break;
          }
          var u = pr(l);
          u !== null && (e.splice(t, 3), t -= 3, hf(
            u,
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
    function t(L) {
      return Ls(L, e);
    }
    ho !== null && Ls(ho, e), yo !== null && Ls(yo, e), vo !== null && Ls(vo, e), Za.forEach(t), Ja.forEach(t);
    for (var l = 0; l < bo.length; l++) {
      var r = bo[l];
      r.blockedOn === e && (r.blockedOn = null);
    }
    for (; 0 < bo.length && (l = bo[0], l.blockedOn === null); )
      Qy(l), l.blockedOn === null && bo.shift();
    if (l = (e.ownerDocument || e).$$reactFormReplay, l != null)
      for (r = 0; r < l.length; r += 3) {
        var s = l[r], u = l[r + 1], h = s[un] || null;
        if (typeof u == "function")
          h || Jy(l);
        else if (h) {
          var C = null;
          if (u && u.hasAttribute("formAction")) {
            if (s = u, h = u[un] || null)
              C = h.formAction;
            else if (yd(s) !== null) continue;
          } else C = h.action;
          typeof C == "function" ? l[r + 1] = C : (l.splice(r, 3), r -= 3), Jy(l);
        }
      }
  }
  function $y() {
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
      s !== null && (s(), s = null), r || setTimeout(l, 20);
    }
    function l() {
      if (!r && !navigation.transition) {
        var u = navigation.currentEntry;
        u && u.url != null && navigation.navigate(u.url, {
          state: u.getState(),
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
  function bd(e) {
    this._internalRoot = e;
  }
  Bs.prototype.render = bd.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(i(409));
    var l = t.current, r = Un();
    Yy(l, r, e, t, null, null);
  }, Bs.prototype.unmount = bd.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      Yy(e.current, 2, null, e, null, null), xs(), t[rl] = null;
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
      bo.splice(l, 0, e), l === 0 && Qy(e);
    }
  };
  var Wy = o.version;
  if (Wy !== "19.2.7")
    throw Error(
      i(
        527,
        Wy,
        "19.2.7"
      )
    );
  Y.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0)
      throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
    return e = d(t), e = e !== null ? v(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var T1 = {
    bundleType: 0,
    version: "19.2.7",
    rendererPackageName: "react-dom",
    currentDispatcherRef: _,
    reconcilerVersion: "19.2.7"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Vs = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Vs.isDisabled && Vs.supportsFiber)
      try {
        et = Vs.inject(
          T1
        ), gt = Vs;
      } catch {
      }
  }
  return ei.createRoot = function(e, t) {
    if (!c(e)) throw Error(i(299));
    var l = !1, r = "", s = ah, u = ih, h = sh;
    return t != null && (t.unstable_strictMode === !0 && (l = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (s = t.onUncaughtError), t.onCaughtError !== void 0 && (u = t.onCaughtError), t.onRecoverableError !== void 0 && (h = t.onRecoverableError)), t = Vy(
      e,
      1,
      !1,
      null,
      null,
      l,
      r,
      null,
      s,
      u,
      h,
      $y
    ), e[rl] = t.current, ed(e), new bd(t);
  }, ei.hydrateRoot = function(e, t, l) {
    if (!c(e)) throw Error(i(299));
    var r = !1, s = "", u = ah, h = ih, C = sh, L = null;
    return l != null && (l.unstable_strictMode === !0 && (r = !0), l.identifierPrefix !== void 0 && (s = l.identifierPrefix), l.onUncaughtError !== void 0 && (u = l.onUncaughtError), l.onCaughtError !== void 0 && (h = l.onCaughtError), l.onRecoverableError !== void 0 && (C = l.onRecoverableError), l.formState !== void 0 && (L = l.formState)), t = Vy(
      e,
      1,
      !0,
      t,
      l ?? null,
      r,
      s,
      L,
      u,
      h,
      C,
      $y
    ), t.context = Py(null), l = t.current, r = Un(), r = qe(r), s = lo(r), s.callback = null, oo(l, s, r), l = r, t.current.lanes = l, qt(t, l), ul(t), e[rl] = t.current, ed(e), new Bs(t);
  }, ei.version = "19.2.7", ei;
}
var uv;
function H1() {
  if (uv) return wd.exports;
  uv = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
      } catch (o) {
        console.error(o);
      }
  }
  return n(), wd.exports = _1(), wd.exports;
}
var U1 = H1();
const Eb = (...n) => n.filter((o, a, i) => !!o && o.trim() !== "" && i.indexOf(o) === a).join(" ").trim();
const L1 = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const I1 = (n) => n.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (o, a, i) => i ? i.toUpperCase() : a.toLowerCase()
);
const cv = (n) => {
  const o = I1(n);
  return o.charAt(0).toUpperCase() + o.slice(1);
};
var Cd = {
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
const B1 = (n) => {
  for (const o in n)
    if (o.startsWith("aria-") || o === "role" || o === "title")
      return !0;
  return !1;
}, V1 = y.createContext({}), P1 = () => y.useContext(V1), Y1 = y.forwardRef(
  ({ color: n, size: o, strokeWidth: a, absoluteStrokeWidth: i, className: c = "", children: f, iconNode: p, ...g }, m) => {
    const {
      size: d = 24,
      strokeWidth: v = 2,
      absoluteStrokeWidth: b = !1,
      color: x = "currentColor",
      className: R = ""
    } = P1() ?? {}, w = i ?? b ? Number(a ?? v) * 24 / Number(o ?? d) : a ?? v;
    return y.createElement(
      "svg",
      {
        ref: m,
        ...Cd,
        width: o ?? d ?? Cd.width,
        height: o ?? d ?? Cd.height,
        stroke: n ?? x,
        strokeWidth: w,
        className: Eb("lucide", R, c),
        ...!f && !B1(g) && { "aria-hidden": "true" },
        ...g
      },
      [
        ...p.map(([D, T]) => y.createElement(D, T)),
        ...Array.isArray(f) ? f : [f]
      ]
    );
  }
);
const sn = (n, o) => {
  const a = y.forwardRef(
    ({ className: i, ...c }, f) => y.createElement(Y1, {
      ref: f,
      iconNode: o,
      className: Eb(
        `lucide-${L1(cv(n))}`,
        `lucide-${n}`,
        i
      ),
      ...c
    })
  );
  return a.displayName = cv(n), a;
};
const G1 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], cu = sn("check", G1);
const q1 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], Tb = sn("chevron-down", q1);
const X1 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], F1 = sn("chevron-right", X1);
const K1 = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
], fv = sn("ellipsis", K1);
const Q1 = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
], Z1 = sn("folder-open", Q1);
const J1 = [
  [
    "path",
    {
      d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",
      key: "sc7q7i"
    }
  ]
], $1 = sn("funnel", J1);
const W1 = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], dv = sn("layout-grid", W1);
const eE = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]], tE = sn("loader-circle", eE);
const nE = [
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
], lE = sn("notebook-pen", nE);
const oE = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], rE = sn("plus", oE);
const aE = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], iE = sn("refresh-cw", aE);
const sE = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
], uE = sn("rotate-ccw", sE);
const cE = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], Rb = sn("search", cE);
const fE = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Cb = sn("settings", fE);
const dE = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
], pE = sn("square-check", dE);
const gE = [
  [
    "path",
    {
      d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
      key: "r04s7s"
    }
  ]
], Zd = sn("star", gE);
const mE = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], Ob = sn("trash-2", mE);
const hE = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], gi = sn("x", hE);
function Ou() {
  return typeof window < "u";
}
function mn(n) {
  return hp(n) ? (n.nodeName || "").toLowerCase() : "#document";
}
function zt(n) {
  var o;
  return (n == null || (o = n.ownerDocument) == null ? void 0 : o.defaultView) || window;
}
function Fl(n) {
  var o;
  return (o = (hp(n) ? n.ownerDocument : n.document) || window.document) == null ? void 0 : o.documentElement;
}
function hp(n) {
  return Ou() ? n instanceof Node || n instanceof zt(n).Node : !1;
}
function $e(n) {
  return Ou() ? n instanceof Element || n instanceof zt(n).Element : !1;
}
function Rt(n) {
  return Ou() ? n instanceof HTMLElement || n instanceof zt(n).HTMLElement : !1;
}
function ta(n) {
  return !Ou() || typeof ShadowRoot > "u" ? !1 : n instanceof ShadowRoot || n instanceof zt(n).ShadowRoot;
}
function sr(n) {
  const {
    overflow: o,
    overflowX: a,
    overflowY: i,
    display: c
  } = In(n);
  return /auto|scroll|overlay|hidden|clip/.test(o + i + a) && c !== "inline" && c !== "contents";
}
function yE(n) {
  return /^(table|td|th)$/.test(mn(n));
}
function Mu(n) {
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
const vE = /transform|translate|scale|rotate|perspective|filter/, bE = /paint|layout|strict|content/, $o = (n) => !!n && n !== "none";
let Od;
function yp(n) {
  const o = $e(n) ? In(n) : n;
  return $o(o.transform) || $o(o.translate) || $o(o.scale) || $o(o.rotate) || $o(o.perspective) || !vp() && ($o(o.backdropFilter) || $o(o.filter)) || vE.test(o.willChange || "") || bE.test(o.contain || "");
}
function xE(n) {
  let o = Yl(n);
  for (; Rt(o) && !Bl(o); ) {
    if (yp(o))
      return o;
    if (Mu(o))
      return null;
    o = Yl(o);
  }
  return null;
}
function vp() {
  return Od == null && (Od = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Od;
}
function Bl(n) {
  return /^(html|body|#document)$/.test(mn(n));
}
function In(n) {
  return zt(n).getComputedStyle(n);
}
function Au(n) {
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
function Mb(n) {
  const o = Yl(n);
  return Bl(o) ? (n.ownerDocument || n).body : Rt(o) && sr(o) ? o : Mb(o);
}
function mi(n, o, a) {
  var i;
  o === void 0 && (o = []), a === void 0 && (a = !0);
  const c = Mb(n), f = c === ((i = n.ownerDocument) == null ? void 0 : i.body), p = zt(c);
  if (f) {
    const g = Jd(p);
    return o.concat(p, p.visualViewport || [], sr(c) ? c : [], g && a ? mi(g) : []);
  } else
    return o.concat(c, mi(c, [], a));
}
function Jd(n) {
  return n.parent && Object.getPrototypeOf(n.parent) ? n.frameElement : null;
}
const bp = {
  ...D1
}, pv = {};
function xn(n, o) {
  const a = y.useRef(pv);
  return a.current === pv && (a.current = n(o)), a;
}
const Md = bp.useInsertionEffect, SE = (
  // React 17 doesn't have useInsertionEffect.
  Md && // Preact replaces useInsertionEffect with useLayoutEffect and fires too late.
  Md !== bp.useLayoutEffect ? Md : (n) => n()
);
function ze(n) {
  const o = xn(wE).current;
  return o.next = n, SE(o.effect), o.trampoline;
}
function wE() {
  const n = {
    next: void 0,
    callback: EE,
    trampoline: (...o) => n.callback?.(...o),
    effect: () => {
      n.callback = n.next;
    }
  };
  return n;
}
function EE() {
}
const TE = () => {
}, xe = typeof document < "u" ? y.useLayoutEffect : TE;
function $d(n, o) {
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
const xp = {};
function bn(n, o, a, i, c) {
  if (!a && !i && !c && !n)
    return fu(o);
  let f = fu(n);
  return o && (f = oi(f, o)), a && (f = oi(f, a)), i && (f = oi(f, i)), c && (f = oi(f, c)), f;
}
function RE(n) {
  if (n.length === 0)
    return xp;
  if (n.length === 1)
    return fu(n[0]);
  let o = fu(n[0]);
  for (let a = 1; a < n.length; a += 1)
    o = oi(o, n[a]);
  return o;
}
function fu(n) {
  return Sp(n) ? {
    ...zb(n, xp)
  } : CE(n);
}
function oi(n, o) {
  return Sp(o) ? zb(o, n) : OE(n, o);
}
function CE(n) {
  const o = {
    ...n
  };
  for (const a in o) {
    const i = o[a];
    Ab(a, i) && (o[a] = Db(i));
  }
  return o;
}
function OE(n, o) {
  if (!o)
    return n;
  for (const a in o) {
    const i = o[a];
    switch (a) {
      case "style": {
        n[a] = $d(n.style, i);
        break;
      }
      case "className": {
        n[a] = Nb(n.className, i);
        break;
      }
      default:
        Ab(a, i) ? n[a] = ME(n[a], i) : n[a] = i;
    }
  }
  return n;
}
function Ab(n, o) {
  const a = n.charCodeAt(0), i = n.charCodeAt(1), c = n.charCodeAt(2);
  return a === 111 && i === 110 && c >= 65 && c <= 90 && (typeof o == "function" || typeof o > "u");
}
function Sp(n) {
  return typeof n == "function";
}
function zb(n, o) {
  return Sp(n) ? n(o) : n ?? xp;
}
function ME(n, o) {
  return o ? n ? (...a) => {
    const i = a[0];
    if (jb(i)) {
      const f = i;
      du(f);
      const p = o(...a);
      return f.baseUIHandlerPrevented || n?.(...a), p;
    }
    const c = o(...a);
    return n?.(...a), c;
  } : Db(o) : n;
}
function Db(n) {
  return n && ((...o) => {
    const a = o[0];
    return jb(a) && du(a), n(...o);
  });
}
function du(n) {
  return n.preventBaseUIHandler = () => {
    n.baseUIHandlerPrevented = !0;
  }, n;
}
function Nb(n, o) {
  return o ? n ? o + " " + n : o : n;
}
function jb(n) {
  return n != null && typeof n == "object" && "nativeEvent" in n;
}
function AE(n, o) {
  return function(i, ...c) {
    const f = new URL(n);
    return f.searchParams.set("code", i.toString()), c.forEach((p) => f.searchParams.append("args[]", p)), `${o} error #${i}; visit ${f} for the full message.`;
  };
}
const Mt = AE("https://base-ui.com/production-error", "Base UI"), kb = /* @__PURE__ */ y.createContext(void 0);
function wp(n = !1) {
  const o = y.useContext(kb);
  if (o === void 0 && !n)
    throw new Error(Mt(16));
  return o;
}
function zE(n) {
  const {
    focusableWhenDisabled: o,
    disabled: a,
    composite: i = !1,
    tabIndex: c = 0,
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
      return i || (d.tabIndex = c, !f && a && (d.tabIndex = o ? c : -1)), (f && (o || p) || !f && a) && (d["aria-disabled"] = a), f && (!o || g) && (d.disabled = a), d;
    }, [i, a, o, p, g, f, c])
  };
}
function Oo(n = {}) {
  const {
    disabled: o = !1,
    focusableWhenDisabled: a,
    tabIndex: i = 0,
    native: c = !0,
    composite: f
  } = n, p = y.useRef(null), g = wp(!0), m = f ?? g !== void 0, {
    props: d
  } = zE({
    focusableWhenDisabled: a,
    disabled: o,
    composite: m,
    tabIndex: i,
    isNativeButton: c
  }), v = y.useCallback(() => {
    const R = p.current;
    Ad(R) && m && o && d.disabled === void 0 && R.disabled && (R.disabled = !1);
  }, [o, d.disabled, m]);
  xe(v, [v]);
  const b = y.useCallback((R = {}) => {
    const {
      onClick: w,
      onMouseDown: D,
      onKeyUp: T,
      onKeyDown: N,
      onPointerDown: A,
      ...E
    } = R;
    return bn({
      onClick(z) {
        if (o) {
          z.preventDefault();
          return;
        }
        w?.(z);
      },
      onMouseDown(z) {
        o || D?.(z);
      },
      onKeyDown(z) {
        if (o || (du(z), N?.(z), z.baseUIHandlerPrevented))
          return;
        const U = z.target === z.currentTarget, j = z.currentTarget, O = Ad(j), k = !c && DE(j), G = U && (c ? O : !k), P = z.key === "Enter", ne = z.key === " ", K = j.getAttribute("role"), Q = K?.startsWith("menuitem") || K === "option" || K === "gridcell";
        if (U && m && ne) {
          if (z.defaultPrevented && Q)
            return;
          z.preventDefault(), k || c && O ? (j.click(), z.preventBaseUIHandler()) : G && (w?.(z), z.preventBaseUIHandler());
          return;
        }
        G && (!c && (ne || P) && z.preventDefault(), !c && P && w?.(z));
      },
      onKeyUp(z) {
        if (!o) {
          if (du(z), T?.(z), z.target === z.currentTarget && c && m && Ad(z.currentTarget) && z.key === " ") {
            z.preventDefault();
            return;
          }
          z.baseUIHandlerPrevented || z.target === z.currentTarget && !c && !m && z.key === " " && w?.(z);
        }
      },
      onPointerDown(z) {
        if (o) {
          z.preventDefault();
          return;
        }
        A?.(z);
      }
    }, c ? {
      type: "button"
    } : {
      role: "button"
    }, d, E);
  }, [o, d, m, c]), x = ze((R) => {
    p.current = R, v();
  });
  return {
    getButtonProps: b,
    buttonRef: x
  };
}
function Ad(n) {
  return Rt(n) && n.tagName === "BUTTON";
}
function DE(n) {
  return !!(n?.tagName === "A" && n?.href);
}
function Eo(n, o, a, i) {
  const c = xn(_b).current;
  return jE(c, n, o, a, i) && Hb(c, [n, o, a, i]), c.callback;
}
function NE(n) {
  const o = xn(_b).current;
  return kE(o, n) && Hb(o, n), o.callback;
}
function _b() {
  return {
    callback: null,
    cleanup: null,
    refs: []
  };
}
function jE(n, o, a, i, c) {
  return n.refs[0] !== o || n.refs[1] !== a || n.refs[2] !== i || n.refs[3] !== c;
}
function kE(n, o) {
  return n.refs.length !== o.length || n.refs.some((a, i) => a !== o[i]);
}
function Hb(n, o) {
  if (n.refs = o, o.every((a) => a == null)) {
    n.callback = null;
    return;
  }
  n.callback = (a) => {
    if (n.cleanup && (n.cleanup(), n.cleanup = null), a != null) {
      const i = Array(o.length).fill(null);
      for (let c = 0; c < o.length; c += 1) {
        const f = o[c];
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
        for (let c = 0; c < o.length; c += 1) {
          const f = o[c];
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
const _E = parseInt(y.version, 10);
function Ep(n) {
  return _E >= n;
}
function gv(n) {
  if (!/* @__PURE__ */ y.isValidElement(n))
    return null;
  const o = n, a = o.props;
  return (Ep(19) ? a?.ref : o.ref) ?? null;
}
function rn() {
}
const Gl = Object.freeze([]), bt = Object.freeze({});
function HE(n, o) {
  const a = {};
  for (const i in n) {
    const c = n[i];
    if (o?.hasOwnProperty(i)) {
      const f = o[i](c);
      f != null && Object.assign(a, f);
      continue;
    }
    c === !0 ? a[`data-${i.toLowerCase()}`] = "" : c && (a[`data-${i.toLowerCase()}`] = c.toString());
  }
  return a;
}
function UE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function LE(n, o) {
  return typeof n == "function" ? n(o) : n;
}
function nt(n, o, a = {}) {
  const i = o.render, c = IE(o, a);
  if (a.enabled === !1)
    return null;
  const f = a.state ?? bt;
  return PE(n, i, c, f);
}
function IE(n, o = {}) {
  const {
    className: a,
    style: i,
    render: c
  } = n, {
    state: f = bt,
    ref: p,
    props: g,
    stateAttributesMapping: m,
    enabled: d = !0
  } = o, v = d ? UE(a, f) : void 0, b = d ? LE(i, f) : void 0, x = d ? HE(f, m) : bt, R = d && g ? BE(g) : void 0, w = d ? $d(x, R) ?? {} : bt;
  return typeof document < "u" && (d ? Array.isArray(p) ? w.ref = NE([w.ref, gv(c), ...p]) : w.ref = Eo(w.ref, gv(c), p) : Eo(null, null)), d ? (v !== void 0 && (w.className = Nb(w.className, v)), b !== void 0 && (w.style = $d(w.style, b)), w) : bt;
}
function BE(n) {
  return Array.isArray(n) ? RE(n) : bn(void 0, n);
}
const VE = /* @__PURE__ */ Symbol.for("react.lazy");
function PE(n, o, a, i) {
  if (o) {
    if (typeof o == "function")
      return o(a, i);
    const c = bn(a, o.props);
    c.ref = a.ref;
    let f = o;
    return f?.$$typeof === VE && (f = y.Children.toArray(o)[0]), /* @__PURE__ */ y.cloneElement(f, c);
  }
  if (n && typeof n == "string")
    return YE(n, a);
  throw new Error(Mt(8));
}
function YE(n, o) {
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
const GE = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
function Ub(n) {
  var o, a, i = "";
  if (typeof n == "string" || typeof n == "number") i += n;
  else if (typeof n == "object") if (Array.isArray(n)) {
    var c = n.length;
    for (o = 0; o < c; o++) n[o] && (a = Ub(n[o])) && (i && (i += " "), i += a);
  } else for (a in n) n[a] && (i && (i += " "), i += a);
  return i;
}
function Lb() {
  for (var n, o, a = 0, i = "", c = arguments.length; a < c; a++) (n = arguments[a]) && (o = Ub(n)) && (i && (i += " "), i += o);
  return i;
}
const mv = (n) => typeof n == "boolean" ? `${n}` : n === 0 ? "0" : n, hv = Lb, aa = (n, o) => (a) => {
  var i;
  if (o?.variants == null) return hv(n, a?.class, a?.className);
  const { variants: c, defaultVariants: f } = o, p = Object.keys(c).map((d) => {
    const v = a?.[d], b = f?.[d];
    if (v === null) return null;
    const x = mv(v) || mv(b);
    return c[d][x];
  }), g = a && Object.entries(a).reduce((d, v) => {
    let [b, x] = v;
    return x === void 0 || (d[b] = x), d;
  }, {}), m = o == null || (i = o.compoundVariants) === null || i === void 0 ? void 0 : i.reduce((d, v) => {
    let { class: b, className: x, ...R } = v;
    return Object.entries(R).every((w) => {
      let [D, T] = w;
      return Array.isArray(T) ? T.includes({
        ...f,
        ...g
      }[D]) : {
        ...f,
        ...g
      }[D] === T;
    }) ? [
      ...d,
      b,
      x
    ] : d;
  }, []);
  return hv(n, p, m, a?.class, a?.className);
}, qE = (n, o) => {
  const a = new Array(n.length + o.length);
  for (let i = 0; i < n.length; i++)
    a[i] = n[i];
  for (let i = 0; i < o.length; i++)
    a[n.length + i] = o[i];
  return a;
}, XE = (n, o) => ({
  classGroupId: n,
  validator: o
}), Ib = (n = /* @__PURE__ */ new Map(), o = null, a) => ({
  nextPart: n,
  validators: o,
  classGroupId: a
}), pu = "-", yv = [], FE = "arbitrary..", KE = (n) => {
  const o = ZE(n), {
    conflictingClassGroups: a,
    conflictingClassGroupModifiers: i
  } = n;
  return {
    getClassGroupId: (p) => {
      if (p.startsWith("[") && p.endsWith("]"))
        return QE(p);
      const g = p.split(pu), m = g[0] === "" && g.length > 1 ? 1 : 0;
      return Bb(g, m, o);
    },
    getConflictingClassGroupIds: (p, g) => {
      if (g) {
        const m = i[p], d = a[p];
        return m ? d ? qE(d, m) : m : d || yv;
      }
      return a[p] || yv;
    }
  };
}, Bb = (n, o, a) => {
  if (n.length - o === 0)
    return a.classGroupId;
  const c = n[o], f = a.nextPart.get(c);
  if (f) {
    const d = Bb(n, o + 1, f);
    if (d) return d;
  }
  const p = a.validators;
  if (p === null)
    return;
  const g = o === 0 ? n.join(pu) : n.slice(o).join(pu), m = p.length;
  for (let d = 0; d < m; d++) {
    const v = p[d];
    if (v.validator(g))
      return v.classGroupId;
  }
}, QE = (n) => n.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
  const o = n.slice(1, -1), a = o.indexOf(":"), i = o.slice(0, a);
  return i ? FE + i : void 0;
})(), ZE = (n) => {
  const {
    theme: o,
    classGroups: a
  } = n;
  return JE(a, o);
}, JE = (n, o) => {
  const a = Ib();
  for (const i in n) {
    const c = n[i];
    Tp(c, a, i, o);
  }
  return a;
}, Tp = (n, o, a, i) => {
  const c = n.length;
  for (let f = 0; f < c; f++) {
    const p = n[f];
    $E(p, o, a, i);
  }
}, $E = (n, o, a, i) => {
  if (typeof n == "string") {
    WE(n, o, a);
    return;
  }
  if (typeof n == "function") {
    eT(n, o, a, i);
    return;
  }
  tT(n, o, a, i);
}, WE = (n, o, a) => {
  const i = n === "" ? o : Vb(o, n);
  i.classGroupId = a;
}, eT = (n, o, a, i) => {
  if (nT(n)) {
    Tp(n(i), o, a, i);
    return;
  }
  o.validators === null && (o.validators = []), o.validators.push(XE(a, n));
}, tT = (n, o, a, i) => {
  const c = Object.entries(n), f = c.length;
  for (let p = 0; p < f; p++) {
    const [g, m] = c[p];
    Tp(m, Vb(o, g), a, i);
  }
}, Vb = (n, o) => {
  let a = n;
  const i = o.split(pu), c = i.length;
  for (let f = 0; f < c; f++) {
    const p = i[f];
    let g = a.nextPart.get(p);
    g || (g = Ib(), a.nextPart.set(p, g)), a = g;
  }
  return a;
}, nT = (n) => "isThemeGetter" in n && n.isThemeGetter === !0, lT = (n) => {
  if (n < 1)
    return {
      get: () => {
      },
      set: () => {
      }
    };
  let o = 0, a = /* @__PURE__ */ Object.create(null), i = /* @__PURE__ */ Object.create(null);
  const c = (f, p) => {
    a[f] = p, o++, o > n && (o = 0, i = a, a = /* @__PURE__ */ Object.create(null));
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
}, Wd = "!", vv = ":", oT = [], bv = (n, o, a, i, c) => ({
  modifiers: n,
  hasImportantModifier: o,
  baseClassName: a,
  maybePostfixModifierPosition: i,
  isExternal: c
}), rT = (n) => {
  const {
    prefix: o,
    experimentalParseClassName: a
  } = n;
  let i = (c) => {
    const f = [];
    let p = 0, g = 0, m = 0, d;
    const v = c.length;
    for (let D = 0; D < v; D++) {
      const T = c[D];
      if (p === 0 && g === 0) {
        if (T === vv) {
          f.push(c.slice(m, D)), m = D + 1;
          continue;
        }
        if (T === "/") {
          d = D;
          continue;
        }
      }
      T === "[" ? p++ : T === "]" ? p-- : T === "(" ? g++ : T === ")" && g--;
    }
    const b = f.length === 0 ? c : c.slice(m);
    let x = b, R = !1;
    b.endsWith(Wd) ? (x = b.slice(0, -1), R = !0) : (
      /**
       * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
       * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
       */
      b.startsWith(Wd) && (x = b.slice(1), R = !0)
    );
    const w = d && d > m ? d - m : void 0;
    return bv(f, R, x, w);
  };
  if (o) {
    const c = o + vv, f = i;
    i = (p) => p.startsWith(c) ? f(p.slice(c.length)) : bv(oT, !1, p, void 0, !0);
  }
  if (a) {
    const c = i;
    i = (f) => a({
      className: f,
      parseClassName: c
    });
  }
  return i;
}, aT = (n) => {
  const o = /* @__PURE__ */ new Map();
  return n.orderSensitiveModifiers.forEach((a, i) => {
    o.set(a, 1e6 + i);
  }), (a) => {
    const i = [];
    let c = [];
    for (let f = 0; f < a.length; f++) {
      const p = a[f], g = p[0] === "[", m = o.has(p);
      g || m ? (c.length > 0 && (c.sort(), i.push(...c), c = []), i.push(p)) : c.push(p);
    }
    return c.length > 0 && (c.sort(), i.push(...c)), i;
  };
}, iT = (n) => ({
  cache: lT(n.cacheSize),
  parseClassName: rT(n),
  sortModifiers: aT(n),
  postfixLookupClassGroupIds: sT(n),
  ...KE(n)
}), sT = (n) => {
  const o = /* @__PURE__ */ Object.create(null), a = n.postfixLookupClassGroups;
  if (a)
    for (let i = 0; i < a.length; i++)
      o[a[i]] = !0;
  return o;
}, uT = /\s+/, cT = (n, o) => {
  const {
    parseClassName: a,
    getClassGroupId: i,
    getConflictingClassGroupIds: c,
    sortModifiers: f,
    postfixLookupClassGroupIds: p
  } = o, g = [], m = n.trim().split(uT);
  let d = "";
  for (let v = m.length - 1; v >= 0; v -= 1) {
    const b = m[v], {
      isExternal: x,
      modifiers: R,
      hasImportantModifier: w,
      baseClassName: D,
      maybePostfixModifierPosition: T
    } = a(b);
    if (x) {
      d = b + (d.length > 0 ? " " + d : d);
      continue;
    }
    let N = !!T, A;
    if (N) {
      const O = D.substring(0, T);
      A = i(O);
      const k = A && p[A] ? i(D) : void 0;
      k && k !== A && (A = k, N = !1);
    } else
      A = i(D);
    if (!A) {
      if (!N) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      if (A = i(D), !A) {
        d = b + (d.length > 0 ? " " + d : d);
        continue;
      }
      N = !1;
    }
    const E = R.length === 0 ? "" : R.length === 1 ? R[0] : f(R).join(":"), z = w ? E + Wd : E, U = z + A;
    if (g.indexOf(U) > -1)
      continue;
    g.push(U);
    const j = c(A, N);
    for (let O = 0; O < j.length; ++O) {
      const k = j[O];
      g.push(z + k);
    }
    d = b + (d.length > 0 ? " " + d : d);
  }
  return d;
}, fT = (...n) => {
  let o = 0, a, i, c = "";
  for (; o < n.length; )
    (a = n[o++]) && (i = Pb(a)) && (c && (c += " "), c += i);
  return c;
}, Pb = (n) => {
  if (typeof n == "string")
    return n;
  let o, a = "";
  for (let i = 0; i < n.length; i++)
    n[i] && (o = Pb(n[i])) && (a && (a += " "), a += o);
  return a;
}, dT = (n, ...o) => {
  let a, i, c, f;
  const p = (m) => {
    const d = o.reduce((v, b) => b(v), n());
    return a = iT(d), i = a.cache.get, c = a.cache.set, f = g, g(m);
  }, g = (m) => {
    const d = i(m);
    if (d)
      return d;
    const v = cT(m, a);
    return c(m, v), v;
  };
  return f = p, (...m) => f(fT(...m));
}, pT = [], tn = (n) => {
  const o = (a) => a[n] || pT;
  return o.isThemeGetter = !0, o;
}, Yb = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Gb = /^\((?:(\w[\w-]*):)?(.+)\)$/i, gT = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, mT = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, hT = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, yT = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, vT = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, bT = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, So = (n) => gT.test(n), Ze = (n) => !!n && !Number.isNaN(Number(n)), cl = (n) => !!n && Number.isInteger(Number(n)), zd = (n) => n.endsWith("%") && Ze(n.slice(0, -1)), Hl = (n) => mT.test(n), qb = () => !0, xT = (n) => (
  // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
  // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
  // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
  hT.test(n) && !yT.test(n)
), Rp = () => !1, ST = (n) => vT.test(n), wT = (n) => bT.test(n), ET = (n) => !Me(n) && !Ae(n), TT = (n) => n.startsWith("@container") && (n[10] === "/" && n[11] !== void 0 || n[11] === "s" && n[16] !== void 0 && n.startsWith("-size/", 10) || n[11] === "n" && n[18] !== void 0 && n.startsWith("-normal/", 10)), RT = (n) => Mo(n, Kb, Rp), Me = (n) => Yb.test(n), Wo = (n) => Mo(n, Qb, xT), xv = (n) => Mo(n, jT, Ze), CT = (n) => Mo(n, Jb, qb), OT = (n) => Mo(n, Zb, Rp), Sv = (n) => Mo(n, Xb, Rp), MT = (n) => Mo(n, Fb, wT), Ps = (n) => Mo(n, $b, ST), Ae = (n) => Gb.test(n), ti = (n) => ur(n, Qb), AT = (n) => ur(n, Zb), wv = (n) => ur(n, Xb), zT = (n) => ur(n, Kb), DT = (n) => ur(n, Fb), Ys = (n) => ur(n, $b, !0), NT = (n) => ur(n, Jb, !0), Mo = (n, o, a) => {
  const i = Yb.exec(n);
  return i ? i[1] ? o(i[1]) : a(i[2]) : !1;
}, ur = (n, o, a = !1) => {
  const i = Gb.exec(n);
  return i ? i[1] ? o(i[1]) : a : !1;
}, Xb = (n) => n === "position" || n === "percentage", Fb = (n) => n === "image" || n === "url", Kb = (n) => n === "length" || n === "size" || n === "bg-size", Qb = (n) => n === "length", jT = (n) => n === "number", Zb = (n) => n === "family-name", Jb = (n) => n === "number" || n === "weight", $b = (n) => n === "shadow", kT = () => {
  const n = tn("color"), o = tn("font"), a = tn("text"), i = tn("font-weight"), c = tn("tracking"), f = tn("leading"), p = tn("breakpoint"), g = tn("container"), m = tn("spacing"), d = tn("radius"), v = tn("shadow"), b = tn("inset-shadow"), x = tn("text-shadow"), R = tn("drop-shadow"), w = tn("blur"), D = tn("perspective"), T = tn("aspect"), N = tn("ease"), A = tn("animate"), E = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], z = () => [
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
  ], U = () => [...z(), Ae, Me], j = () => ["auto", "hidden", "clip", "visible", "scroll"], O = () => ["auto", "contain", "none"], k = () => [Ae, Me, m], G = () => [So, "full", "auto", ...k()], P = () => [cl, "none", "subgrid", Ae, Me], ne = () => ["auto", {
    span: ["full", cl, Ae, Me]
  }, cl, Ae, Me], K = () => [cl, "auto", Ae, Me], Q = () => ["auto", "min", "max", "fr", Ae, Me], Z = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"], q = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"], _ = () => ["auto", ...k()], Y = () => [So, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...k()], B = () => [So, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...k()], F = () => [So, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...k()], I = () => [n, Ae, Me], M = () => [...z(), wv, Sv, {
    position: [Ae, Me]
  }], H = () => ["no-repeat", {
    repeat: ["", "x", "y", "space", "round"]
  }], te = () => ["auto", "cover", "contain", zT, RT, {
    size: [Ae, Me]
  }], J = () => [zd, ti, Wo], re = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    "full",
    d,
    Ae,
    Me
  ], ie = () => ["", Ze, ti, Wo], oe = () => ["solid", "dashed", "dotted", "double"], se = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], ge = () => [Ze, zd, wv, Sv], je = () => [
    // Deprecated since Tailwind CSS v4.0.0
    "",
    "none",
    w,
    Ae,
    Me
  ], Ee = () => ["none", Ze, Ae, Me], fe = () => ["none", Ze, Ae, Me], ye = () => [Ze, Ae, Me], Re = () => [So, "full", ...k()];
  return {
    cacheSize: 500,
    theme: {
      animate: ["spin", "ping", "pulse", "bounce"],
      aspect: ["video"],
      blur: [Hl],
      breakpoint: [Hl],
      color: [qb],
      container: [Hl],
      "drop-shadow": [Hl],
      ease: ["in", "out", "in-out"],
      font: [ET],
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
        aspect: ["auto", "square", So, Me, Ae, T]
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
      "container-named": [TT],
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
        "break-after": E()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": E()
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
        object: U()
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
        overscroll: O()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": O()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": O()
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
        z: [cl, "auto", Ae, Me]
      }],
      // ------------------------
      // --- Flexbox and Grid ---
      // ------------------------
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: [So, "full", "auto", g, ...k()]
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
        order: [cl, "first", "last", "none", Ae, Me]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": P()
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
        "col-start": K()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": K()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": P()
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
        "row-start": K()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": K()
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
        inline: ["auto", ...B()]
      }],
      /**
       * Min-Inline Size
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-inline-size": [{
        "min-inline": ["auto", ...B()]
      }],
      /**
       * Max-Inline Size
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-inline-size": [{
        "max-inline": ["none", ...B()]
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
        text: ["base", a, ti, Wo]
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
        font: [i, NT, CT]
      }],
      /**
       * Font Stretch
       * @see https://tailwindcss.com/docs/font-stretch
       */
      "font-stretch": [{
        "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", zd, Me]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [AT, OT, o]
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
        "line-clamp": [Ze, "none", Ae, xv]
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
        placeholder: I()
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: I()
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
        decoration: I()
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
        tab: [cl, Ae, Me]
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
        bg: M()
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
          }, cl, Ae, Me],
          radial: ["", Ae, Me],
          conic: [cl, Ae, Me]
        }, DT, MT]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      "bg-color": [{
        bg: I()
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
        from: I()
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: I()
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: I()
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
        border: I()
      }],
      /**
       * Border Color Inline
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": I()
      }],
      /**
       * Border Color Block
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": I()
      }],
      /**
       * Border Color Inline Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-s": [{
        "border-s": I()
      }],
      /**
       * Border Color Inline End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-e": [{
        "border-e": I()
      }],
      /**
       * Border Color Block Start
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-bs": [{
        "border-bs": I()
      }],
      /**
       * Border Color Block End
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-be": [{
        "border-be": I()
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": I()
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": I()
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": I()
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": I()
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: I()
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
        outline: ["", Ze, ti, Wo]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: I()
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
        shadow: I()
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
        "inset-shadow": I()
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
        ring: I()
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
        "ring-offset": I()
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
        "inset-ring": I()
      }],
      /**
       * Text Shadow
       * @see https://tailwindcss.com/docs/text-shadow
       */
      "text-shadow": [{
        "text-shadow": ["none", x, Ys, Ps]
      }],
      /**
       * Text Shadow Color
       * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
       */
      "text-shadow-color": [{
        "text-shadow": I()
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
        "mask-linear-from": I()
      }],
      "mask-image-linear-to-color": [{
        "mask-linear-to": I()
      }],
      "mask-image-t-from-pos": [{
        "mask-t-from": ge()
      }],
      "mask-image-t-to-pos": [{
        "mask-t-to": ge()
      }],
      "mask-image-t-from-color": [{
        "mask-t-from": I()
      }],
      "mask-image-t-to-color": [{
        "mask-t-to": I()
      }],
      "mask-image-r-from-pos": [{
        "mask-r-from": ge()
      }],
      "mask-image-r-to-pos": [{
        "mask-r-to": ge()
      }],
      "mask-image-r-from-color": [{
        "mask-r-from": I()
      }],
      "mask-image-r-to-color": [{
        "mask-r-to": I()
      }],
      "mask-image-b-from-pos": [{
        "mask-b-from": ge()
      }],
      "mask-image-b-to-pos": [{
        "mask-b-to": ge()
      }],
      "mask-image-b-from-color": [{
        "mask-b-from": I()
      }],
      "mask-image-b-to-color": [{
        "mask-b-to": I()
      }],
      "mask-image-l-from-pos": [{
        "mask-l-from": ge()
      }],
      "mask-image-l-to-pos": [{
        "mask-l-to": ge()
      }],
      "mask-image-l-from-color": [{
        "mask-l-from": I()
      }],
      "mask-image-l-to-color": [{
        "mask-l-to": I()
      }],
      "mask-image-x-from-pos": [{
        "mask-x-from": ge()
      }],
      "mask-image-x-to-pos": [{
        "mask-x-to": ge()
      }],
      "mask-image-x-from-color": [{
        "mask-x-from": I()
      }],
      "mask-image-x-to-color": [{
        "mask-x-to": I()
      }],
      "mask-image-y-from-pos": [{
        "mask-y-from": ge()
      }],
      "mask-image-y-to-pos": [{
        "mask-y-to": ge()
      }],
      "mask-image-y-from-color": [{
        "mask-y-from": I()
      }],
      "mask-image-y-to-color": [{
        "mask-y-to": I()
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
        "mask-radial-from": I()
      }],
      "mask-image-radial-to-color": [{
        "mask-radial-to": I()
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
        "mask-conic-from": I()
      }],
      "mask-image-conic-to-color": [{
        "mask-conic-to": I()
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
        mask: M()
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
        "drop-shadow": I()
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
        animate: ["none", A, Ae, Me]
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
        perspective: [D, Ae, Me]
      }],
      /**
       * Perspective Origin
       * @see https://tailwindcss.com/docs/perspective-origin
       */
      "perspective-origin": [{
        "perspective-origin": U()
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
        origin: U()
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
        zoom: [cl, Ae, Me]
      }],
      // ---------------------
      // --- Interactivity ---
      // ---------------------
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: I()
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
        caret: I()
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
        "scrollbar-thumb": I()
      }],
      /**
       * Scrollbar Track Color
       * @see https://tailwindcss.com/docs/scrollbar-color
       */
      "scrollbar-track-color": [{
        "scrollbar-track": I()
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
        fill: ["none", ...I()]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [Ze, ti, Wo, xv]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: ["none", ...I()]
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
}, _T = /* @__PURE__ */ dT(kT);
function Ke(...n) {
  return _T(Lb(n));
}
const HT = aa(
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
function _t({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ S.jsx(
    GE,
    {
      "data-slot": "button",
      className: Ke(HT({ variant: o, size: a, className: n })),
      ...i
    }
  );
}
function Cp(n) {
  const o = y.useRef(!0);
  o.current && (o.current = !1, n());
}
function Je(n, o, a, i) {
  return n.addEventListener(o, a, i), () => {
    n.removeEventListener(o, a, i);
  };
}
function UT() {
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
  userAgent: LT,
  platform: IT,
  maxTouchPoints: BT
} = UT(), zu = LT.toLowerCase(), hi = IT.toLowerCase(), Du = /^i(os$|p)/.test(hi) || hi === "macintel" && BT > 1, Ev = "android", ep = hi === Ev || zu.includes(Ev), Op = !Du && hi.startsWith("mac");
hi.startsWith("win");
const VT = Op || Du, Ao = typeof CSS < "u" && !!CSS.supports?.("-webkit-backdrop-filter:none");
!Ao && zu.includes("firefox");
!Ao && zu.includes("chrom");
const PT = VT, Mp = /jsdom|happydom/.test(zu);
function tt(n) {
  return n?.ownerDocument || document;
}
const YT = [];
function Ap(n) {
  y.useEffect(n, YT);
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
function an() {
  const n = xn(el.create).current;
  return Ap(n.disposeEffect), n;
}
const Gs = null;
class GT {
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
      for (let c = 0; c < a.length; c += 1)
        a[c]?.(o);
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
const qs = new GT();
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
function na() {
  const n = xn(dl.create).current;
  return Ap(n.disposeEffect), n;
}
let Tv = {}, Rv = {}, Cv = "";
function qT(n) {
  if (typeof document > "u")
    return !1;
  const o = tt(n);
  return zt(o).innerWidth - o.documentElement.clientWidth > 0;
}
function XT(n) {
  if (!(typeof CSS < "u" && CSS.supports && CSS.supports("scrollbar-gutter", "stable")) || typeof document > "u")
    return !1;
  const a = tt(n), i = a.documentElement, c = a.body, f = sr(i) ? i : c, p = f.style.overflowY, g = i.style.scrollbarGutter;
  i.style.scrollbarGutter = "stable", f.style.overflowY = "scroll";
  const m = f.offsetWidth;
  f.style.overflowY = "hidden";
  const d = f.offsetWidth;
  return f.style.overflowY = p, i.style.scrollbarGutter = g, m === d;
}
function FT(n) {
  const o = tt(n), a = o.documentElement, i = o.body, c = sr(a) ? a : i, f = {
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
function KT(n) {
  const o = tt(n), a = o.documentElement, i = o.body, c = zt(a);
  let f = 0, p = 0, g = !1;
  const m = dl.create();
  if (Ao && (c.visualViewport?.scale ?? 1) !== 1)
    return () => {
    };
  function d() {
    const R = c.getComputedStyle(a), w = c.getComputedStyle(i), N = (R.scrollbarGutter || "").includes("both-edges") ? "stable both-edges" : "stable";
    f = a.scrollTop, p = a.scrollLeft, Tv = {
      scrollbarGutter: a.style.scrollbarGutter,
      overflowY: a.style.overflowY,
      overflowX: a.style.overflowX
    }, Cv = a.style.scrollBehavior, Rv = {
      position: i.style.position,
      height: i.style.height,
      width: i.style.width,
      boxSizing: i.style.boxSizing,
      overflowY: i.style.overflowY,
      overflowX: i.style.overflowX,
      scrollBehavior: i.style.scrollBehavior
    };
    const A = a.scrollHeight > a.clientHeight, E = a.scrollWidth > a.clientWidth, z = R.overflowY === "scroll" || w.overflowY === "scroll", U = R.overflowX === "scroll" || w.overflowX === "scroll", j = Math.max(0, c.innerWidth - i.clientWidth), O = Math.max(0, c.innerHeight - i.clientHeight), k = parseFloat(w.marginTop) + parseFloat(w.marginBottom), G = parseFloat(w.marginLeft) + parseFloat(w.marginRight), P = sr(a) ? a : i;
    if (g = XT(n), g) {
      a.style.scrollbarGutter = N, P.style.overflowY = "hidden", P.style.overflowX = "hidden";
      return;
    }
    Object.assign(a.style, {
      scrollbarGutter: N,
      overflowY: "hidden",
      overflowX: "hidden"
    }), (A || z) && (a.style.overflowY = "scroll"), (E || U) && (a.style.overflowX = "scroll"), Object.assign(i.style, {
      position: "relative",
      height: k || O ? `calc(100dvh - ${k + O}px)` : "100dvh",
      width: G || j ? `calc(100vw - ${G + j}px)` : "100vw",
      boxSizing: "border-box",
      overflow: "hidden",
      scrollBehavior: "unset"
    }), i.scrollTop = f, i.scrollLeft = p, a.setAttribute("data-base-ui-scroll-locked", ""), a.style.scrollBehavior = "unset";
  }
  function v() {
    Object.assign(a.style, Tv), Object.assign(i.style, Rv), g || (a.scrollTop = f, a.scrollLeft = p, a.removeAttribute("data-base-ui-scroll-locked"), a.style.scrollBehavior = Cv);
  }
  function b() {
    v(), m.request(d);
  }
  d();
  const x = Je(c, "resize", b);
  return () => {
    m.cancel(), v(), typeof c.removeEventListener == "function" && x();
  };
}
class QT {
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
    const i = tt(o).documentElement, c = zt(i).getComputedStyle(i).overflowY;
    if (c === "hidden" || c === "clip") {
      this.restore = rn;
      return;
    }
    const f = Du || !qT(o);
    this.restore = f ? FT(o) : KT(o);
  }
}
const ZT = new QT();
function Wb(n = !0, o = null) {
  xe(() => {
    if (n)
      return ZT.acquire(o);
  }, [n, o]);
}
function fl(n) {
  n.preventDefault(), n.stopPropagation();
}
function JT(n) {
  return "nativeEvent" in n;
}
function zp(n) {
  return n.pointerType === "" && n.isTrusted ? !0 : ep && n.pointerType ? n.type === "click" && n.buttons === 1 : n.detail === 0 && !n.pointerType;
}
function e0(n) {
  return Mp ? !1 : !ep && n.width === 0 && n.height === 0 || ep && n.width === 1 && n.height === 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  n.width < 1 && n.height < 1 && n.pressure === 0 && n.detail === 0 && n.pointerType === "touch";
}
function or(n, o) {
  const a = ["mouse", "pen"];
  return o || a.push("", void 0), a.includes(n);
}
function $T(n) {
  const o = n.type;
  return o === "click" || o === "mousedown" || o === "keydown" || o === "keyup";
}
const tp = "data-base-ui-focusable", t0 = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])", Nu = "ArrowLeft", ju = "ArrowRight", n0 = "ArrowUp", Dp = "ArrowDown";
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
function gu(n, o) {
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
function Dd(n, o) {
  if (o == null)
    return !1;
  if ("composedPath" in n)
    return n.composedPath().includes(o);
  const a = n;
  return a.target != null && o.contains(a.target);
}
function WT(n) {
  return n.matches("html,body");
}
function ku(n) {
  return Rt(n) && n.matches(t0);
}
function eR(n) {
  return n?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${t0}`) != null;
}
function np(n) {
  return n ? n.getAttribute("role") === "combobox" && ku(n) : !1;
}
function tR(n) {
  if (!n || Mp)
    return !0;
  try {
    return n.matches(":focus-visible");
  } catch {
    return !0;
  }
}
function mu(n) {
  return n ? n.hasAttribute(tp) ? n : n.querySelector(`[${tp}]`) || n : null;
}
function nR(n, o) {
  return o != null && !or(o) ? 0 : typeof n == "function" ? n() : n;
}
function la(n, o, a) {
  const i = nR(n, a);
  return typeof i == "number" ? i : i?.[o];
}
function Ov(n) {
  return typeof n == "function" ? n() : n;
}
function l0(n, o) {
  return o || n === "click" || n === "mousedown";
}
function lR(n) {
  return n?.includes("mouse") && n !== "mousedown";
}
const zo = "none", ql = "trigger-press", Pt = "trigger-hover", Jr = "trigger-focus", _u = "outside-press", $r = "item-press", o0 = "close-press", To = "focus-out", Si = "escape-key", lp = "list-navigation", r0 = "cancel-open", ri = "sibling-open", oR = "disabled", Hu = "imperative-action", rR = "window-resize";
function Ye(n, o, a, i) {
  let c = !1, f = !1;
  const p = i ?? bt;
  return {
    reason: n,
    event: o ?? new Event("base-ui"),
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
const a0 = /* @__PURE__ */ y.createContext({
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
function aR(n, o) {
  n.current = o.current;
}
function iR(n) {
  const {
    children: o,
    delay: a,
    timeoutMs: i = 0
  } = n, c = y.useRef(a), f = y.useRef(a), p = y.useRef(null), g = y.useRef(null), m = an();
  return xe(() => {
    if (f.current = a, !p.current) {
      c.current = a;
      return;
    }
    c.current = {
      open: la(c.current, "open"),
      close: la(a, "close")
    };
  }, [a, p, c, f]), /* @__PURE__ */ S.jsx(a0.Provider, {
    value: y.useMemo(() => ({
      hasProvider: !0,
      delayRef: c,
      initialDelayRef: f,
      currentIdRef: p,
      timeoutMs: i,
      currentContextRef: g,
      timeout: m
    }), [i, m]),
    children: o
  });
}
function sR(n, o = {
  open: !1
}) {
  const {
    open: a
  } = o, i = "rootStore" in n ? n.rootStore : n, c = i.useState("floatingId"), f = y.useContext(a0), {
    currentIdRef: p,
    delayRef: g,
    timeoutMs: m,
    initialDelayRef: d,
    currentContextRef: v,
    hasProvider: b,
    timeout: x
  } = f, [R, w] = y.useState(!1), D = y.useRef(a), T = y.useRef(!1);
  return xe(() => {
    D.current = a;
  }, [a]), xe(() => () => {
    T.current = !0;
  }, []), xe(() => {
    function N() {
      T.current || w(!1), v.current?.setIsInstantPhase(!1), p.current = null, v.current = null, g.current = d.current, x.clear();
    }
    if (p.current && !a && p.current === c) {
      if (w(!1), m) {
        const A = c;
        return x.start(m, () => {
          i.select("open") || p.current && p.current !== A || N();
        }), () => {
          (D.current || p.current !== A) && x.clear();
        };
      }
      N();
    }
  }, [a, c, p, g, m, d, v, x, i]), xe(() => {
    if (!a)
      return;
    const N = v.current, A = p.current;
    x.clear(), v.current = {
      onOpenChange: i.setOpen,
      setIsInstantPhase: w
    }, p.current = c, g.current = {
      open: 0,
      close: la(d.current, "close")
    }, A !== null && A !== c ? (w(!0), N?.setIsInstantPhase(!0), N?.onOpenChange(!1, Ye(zo))) : (w(!1), N?.setIsInstantPhase(!1));
  }, [a, c, i, p, g, d, v, x]), xe(() => () => {
    if (p.current === c) {
      if (v.current = null, !D.current)
        return;
      p.current = null, aR(g, d), x.clear();
    }
  }, [v, p, g, c, d, x]), y.useMemo(() => ({
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
  const o = xn(uR, n).current;
  return o.next = n, xe(o.effect), o;
}
function uR(n) {
  const o = {
    current: n,
    next: n,
    effect: () => {
      o.current = o.next;
    }
  };
  return o;
}
const i0 = {
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1
}, s0 = {
  ...i0,
  position: "fixed",
  top: 0,
  left: 0
}, cR = {
  ...i0,
  position: "absolute"
}, Ro = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const [i, c] = y.useState();
  xe(() => {
    PT && Ao && c("button");
  }, []);
  const f = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role: i
  };
  return /* @__PURE__ */ S.jsx("span", {
    ...o,
    ref: a,
    style: s0,
    "aria-hidden": i ? void 0 : !0,
    ...f,
    "data-base-ui-focus-guard": ""
  });
}), fR = ["top", "right", "bottom", "left"], oa = Math.min, Vl = Math.max, hu = Math.round, Xs = Math.floor, Pl = (n) => ({
  x: n,
  y: n
}), dR = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function u0(n, o, a) {
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
function Np(n) {
  return n === "x" ? "y" : "x";
}
function jp(n) {
  return n === "y" ? "height" : "width";
}
function Wn(n) {
  const o = n[0];
  return o === "t" || o === "b" ? "y" : "x";
}
function kp(n) {
  return Np(Wn(n));
}
function pR(n, o, a) {
  a === void 0 && (a = !1);
  const i = Do(n), c = kp(n), f = jp(c);
  let p = c === "x" ? i === (a ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return o.reference[f] > o.floating[f] && (p = yu(p)), [p, yu(p)];
}
function gR(n) {
  const o = yu(n);
  return [op(n), o, op(o)];
}
function op(n) {
  return n.includes("start") ? n.replace("start", "end") : n.replace("end", "start");
}
const Mv = ["left", "right"], Av = ["right", "left"], mR = ["top", "bottom"], hR = ["bottom", "top"];
function yR(n, o, a) {
  switch (n) {
    case "top":
    case "bottom":
      return a ? o ? Av : Mv : o ? Mv : Av;
    case "left":
    case "right":
      return o ? mR : hR;
    default:
      return [];
  }
}
function vR(n, o, a, i) {
  const c = Do(n);
  let f = yR(Ln(n), a === "start", i);
  return c && (f = f.map((p) => p + "-" + c), o && (f = f.concat(f.map(op)))), f;
}
function yu(n) {
  const o = Ln(n);
  return dR[o] + n.slice(o.length);
}
function bR(n) {
  var o, a, i, c;
  return {
    top: (o = n.top) != null ? o : 0,
    right: (a = n.right) != null ? a : 0,
    bottom: (i = n.bottom) != null ? i : 0,
    left: (c = n.left) != null ? c : 0
  };
}
function c0(n) {
  return typeof n != "number" ? bR(n) : {
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
    height: c
  } = n;
  return {
    width: i,
    height: c,
    top: a,
    left: o,
    right: o + i,
    bottom: a + c,
    x: o,
    y: a
  };
}
function ui(n, o) {
  return o < 0 || o >= n.length;
}
function ru(n, o) {
  return Il(n.current, {
    disabledIndices: o
  });
}
function rp(n, o) {
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
  amount: c = 1
} = {}) {
  let f = o;
  do
    f += a ? -c : c;
  while (f >= 0 && f <= n.length - 1 && vu(n, f, i));
  return f;
}
function vu(n, o, a) {
  if (typeof a == "function" ? a(o) : a?.includes(o) ?? !1)
    return !0;
  const c = n[o];
  return c ? Uu(c) ? !a && (c.hasAttribute("disabled") || c.getAttribute("aria-disabled") === "true") : !0 : !1;
}
function xR(n) {
  return n.visibility === "hidden" || n.visibility === "collapse";
}
function Uu(n, o = n ? In(n) : null) {
  return !n || !n.isConnected || !o || xR(o) ? !1 : typeof n.checkVisibility == "function" ? n.checkVisibility() : o.display !== "none" && o.display !== "contents";
}
const SR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function wR(n) {
  const o = n.assignedSlot;
  if (o)
    return o;
  if (n.parentElement)
    return n.parentElement;
  const a = n.getRootNode();
  return ta(a) ? a.host : null;
}
function ap(n) {
  for (const o of Array.from(n.children))
    if (mn(o) === "summary")
      return o;
  return null;
}
function ER(n, o) {
  const a = ap(o);
  return !!a && (n === a || Le(a, n));
}
function f0(n) {
  const o = n ? mn(n) : "";
  return n != null && n.matches(SR) && (o !== "summary" || n.parentElement != null && mn(n.parentElement) === "details" && ap(n.parentElement) === n) && (o !== "details" || ap(n) == null) && (o !== "input" || n.type !== "hidden");
}
function d0(n) {
  if (!f0(n) || !n.isConnected || n.matches(":disabled"))
    return !1;
  for (let o = n; o; o = wR(o)) {
    const a = o !== n, i = mn(o) === "slot";
    if (o.hasAttribute("inert") || a && mn(o) === "details" && !o.open && !ER(n, o) || o.hasAttribute("hidden") || !i && !TR(o, a))
      return !1;
  }
  return !0;
}
function TR(n, o) {
  const a = In(n);
  return o ? a.display !== "none" : Uu(n, a);
}
function p0(n) {
  const o = n.tabIndex;
  if (o < 0) {
    const a = mn(n);
    if (a === "details" || a === "audio" || a === "video" || Rt(n) && n.isContentEditable)
      return 0;
  }
  return o;
}
function Nd(n) {
  if (mn(n) !== "input")
    return null;
  const o = n;
  return o.type === "radio" && o.name !== "" ? o : null;
}
function RR(n, o) {
  const a = Nd(n);
  if (!a)
    return !0;
  const i = o.find((c) => {
    const f = Nd(c);
    return f?.name === a.name && f.form === a.form && f.checked;
  });
  return i ? i === a : o.find((c) => {
    const f = Nd(c);
    return f?.name === a.name && f.form === a.form;
  }) === a;
}
function g0(n) {
  if (Rt(n) && mn(n) === "slot") {
    const o = n.assignedElements({
      flatten: !0
    });
    if (o.length > 0)
      return o;
  }
  return Rt(n) && n.shadowRoot ? Array.from(n.shadowRoot.children) : Array.from(n.children);
}
function m0(n, o) {
  g0(n).forEach((a) => {
    f0(a) && o.push(a), m0(a, o);
  });
}
function h0(n, o, a) {
  g0(n).forEach((i) => {
    Rt(i) && i.matches(o) && a.push(i), h0(i, o, a);
  });
}
function _p(n) {
  return d0(n) && p0(n) >= 0;
}
function y0(n) {
  const o = [];
  return m0(n, o), o.filter(d0);
}
function wi(n) {
  const o = y0(n);
  return o.filter((a) => p0(a) >= 0 && RR(a, o));
}
function v0(n, o) {
  const a = wi(n), i = a.length;
  if (i === 0)
    return;
  const c = vn(tt(n)), f = a.indexOf(c), p = f === -1 ? o === 1 ? 0 : i - 1 : f + o;
  return a[p];
}
function Hp(n) {
  return v0(tt(n).body, 1) || n;
}
function b0(n) {
  return v0(tt(n).body, -1) || n;
}
function x0(n, o) {
  if (!n)
    return null;
  const a = wi(tt(n).body), i = a.length;
  if (i === 0)
    return null;
  const c = a.indexOf(n);
  if (c === -1)
    return null;
  const f = (c + o + i) % i;
  return a[f];
}
function CR(n) {
  return x0(n, 1);
}
function OR(n) {
  return x0(n, -1);
}
function Wr(n, o) {
  const a = o || n.currentTarget, i = n.relatedTarget;
  return !i || !Le(a, i);
}
function MR(n) {
  wi(n).forEach((a) => {
    a.dataset.tabindex = a.getAttribute("tabindex") || "", a.setAttribute("tabindex", "-1");
  });
}
function zv(n) {
  const o = [];
  h0(n, "[data-tabindex]", o), o.forEach((a) => {
    const i = a.dataset.tabindex;
    delete a.dataset.tabindex, i ? a.setAttribute("tabindex", i) : a.removeAttribute("tabindex");
  });
}
function Co(n, o, a = !0) {
  return n.filter((c) => c.parentId === o).flatMap((c) => [...!a || c.context?.open ? [c] : [], ...Co(n, c.id, a)]);
}
function Dv(n, o) {
  let a = [], i = n.find((c) => c.id === o)?.parentId;
  for (; i; ) {
    const c = n.find((f) => f.id === i);
    i = c?.parentId, c && (a = a.concat(c));
  }
  return a;
}
function vi(n) {
  return `data-base-ui-${n}`;
}
let Fs = 0;
function au(n, o = {}) {
  const {
    preventScroll: a = !1,
    sync: i = !1,
    shouldFocus: c
  } = o;
  cancelAnimationFrame(Fs);
  function f() {
    c && !c() || n?.focus({
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
const jd = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
}, Nv = "data-base-ui-inert", ip = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let li = /* @__PURE__ */ new WeakMap(), kd = 0;
function AR(n) {
  return ip[n];
}
function S0(n) {
  return n ? ta(n) ? n.host : S0(n.parentNode) : null;
}
const jv = (n, o) => o.map((a) => {
  if (n.contains(a))
    return a;
  const i = S0(a);
  return n.contains(i) ? i : null;
}).filter((a) => a != null), kv = (n) => {
  const o = /* @__PURE__ */ new Set();
  return n.forEach((a) => {
    let i = a;
    for (; i && !o.has(i); )
      o.add(i), i = i.parentNode;
  }), o;
}, _v = (n, o, a) => {
  const i = [], c = (f) => {
    !f || a.has(f) || Array.from(f.children).forEach((p) => {
      mn(p) !== "script" && (o.has(p) ? c(p) : i.push(p));
    });
  };
  return c(n), i;
};
function zR(n, o, a, i, {
  mark: c = !0
}) {
  let f = null;
  i ? f = "inert" : a && (f = "aria-hidden");
  let p = null, g = null;
  const m = jv(o, n), d = c ? _v(o, kv(m), new Set(m)) : [], v = [], b = [];
  if (f) {
    const x = jd[f], R = AR(f);
    g = R, p = x;
    const w = jv(o, Array.from(o.querySelectorAll("[aria-live]"))), D = m.concat(w);
    _v(o, kv(D), new Set(D)).forEach((N) => {
      const A = N.getAttribute(f), E = A !== null && A !== "false", z = (x.get(N) || 0) + 1;
      x.set(N, z), v.push(N), z === 1 && E && R.add(N), E || N.setAttribute(f, f === "inert" ? "" : "true");
    });
  }
  return c && d.forEach((x) => {
    const R = (li.get(x) || 0) + 1;
    li.set(x, R), b.push(x), R === 1 && x.setAttribute(Nv, "");
  }), kd += 1, () => {
    p && v.forEach((x) => {
      const w = (p.get(x) || 0) - 1;
      p.set(x, w), w || (!g?.has(x) && f && x.removeAttribute(f), g?.delete(x));
    }), c && b.forEach((x) => {
      const R = (li.get(x) || 0) - 1;
      li.set(x, R), R || x.removeAttribute(Nv);
    }), kd -= 1, kd || (jd.inert = /* @__PURE__ */ new WeakMap(), jd["aria-hidden"] = /* @__PURE__ */ new WeakMap(), ip.inert = /* @__PURE__ */ new WeakSet(), ip["aria-hidden"] = /* @__PURE__ */ new WeakSet(), li = /* @__PURE__ */ new WeakMap());
  };
}
function Hv(n, o = {}) {
  const {
    ariaHidden: a = !1,
    inert: i = !1,
    mark: c = !0
  } = o, f = tt(n[0]).body;
  return zR(n, f, a, i, {
    mark: c
  });
}
var gl = wb();
let Uv = 0;
function DR(n, o = "mui") {
  const [a, i] = y.useState(n), c = n || a;
  return y.useEffect(() => {
    a == null && (Uv += 1, i(`${o}-${Uv}`));
  }, [a, o]), c;
}
const Lv = bp.useId;
function rr(n, o) {
  if (Lv !== void 0) {
    const a = Lv();
    return n ?? (o ? `${o}-${a}` : a);
  }
  return DR(n, o);
}
const NR = 500, w0 = 500, jR = {
  style: {
    transition: "none"
  }
}, E0 = "data-base-ui-click-trigger", T0 = {
  fallbackAxisSide: "none"
}, Up = {
  fallbackAxisSide: "end"
}, kR = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
}, R0 = /* @__PURE__ */ y.createContext(null), C0 = () => y.useContext(R0), _R = vi("portal");
function O0(n = {}) {
  const {
    ref: o,
    container: a,
    componentProps: i = bt,
    elementProps: c
  } = n, f = rr(), g = C0()?.portalNode, [m, d] = y.useState(null), [v, b] = y.useState(null), x = ze((T) => {
    T !== null && b(T);
  }), R = y.useRef(null);
  xe(() => {
    if (a === null) {
      R.current && (R.current = null, b(null), d(null));
      return;
    }
    if (f == null)
      return;
    const T = (a && (hp(a) ? a : a.current)) ?? g ?? document.body;
    if (T == null) {
      R.current && (R.current = null, b(null), d(null));
      return;
    }
    R.current !== T && (R.current = T, b(null), d(T));
  }, [a, g, f]);
  const w = nt("div", i, {
    ref: [o, x],
    props: [{
      id: f,
      [_R]: ""
    }, c]
  });
  return {
    portalNode: v,
    portalSubtree: m && w ? /* @__PURE__ */ gl.createPortal(w, m) : null
  };
}
const Lu = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    children: p,
    container: g,
    renderGuards: m,
    ...d
  } = o, {
    portalNode: v,
    portalSubtree: b
  } = O0({
    container: g,
    ref: a,
    componentProps: o,
    elementProps: d
  }), x = y.useRef(null), R = y.useRef(null), w = y.useRef(null), D = y.useRef(null), [T, N] = y.useState(null), A = y.useRef(!1), E = T?.modal, z = T?.open, U = typeof m == "boolean" ? m : !!T && !T.modal && T.open && !!v;
  y.useEffect(() => {
    if (!v || E)
      return;
    function O(k) {
      v && k.relatedTarget && Wr(k) && (k.type === "focusin" ? A.current && (zv(v), A.current = !1) : (MR(v), A.current = !0));
    }
    return pl(Je(v, "focusin", O, !0), Je(v, "focusout", O, !0));
  }, [v, E]), xe(() => {
    !v || z !== !0 || !A.current || (zv(v), A.current = !1);
  }, [z, v]);
  const j = y.useMemo(() => ({
    beforeOutsideRef: x,
    afterOutsideRef: R,
    beforeInsideRef: w,
    afterInsideRef: D,
    portalNode: v,
    setFocusManagerState: N
  }), [v]);
  return /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [b, /* @__PURE__ */ S.jsxs(R0.Provider, {
      value: j,
      children: [U && v && /* @__PURE__ */ S.jsx(Ro, {
        "data-type": "outside",
        ref: x,
        onFocus: (O) => {
          if (Wr(O, v))
            w.current?.focus();
          else {
            const k = T ? T.domReference : null;
            b0(k)?.focus();
          }
        }
      }), U && v && /* @__PURE__ */ S.jsx("span", {
        "aria-owns": v.id,
        style: kR
      }), v && /* @__PURE__ */ gl.createPortal(p, v), U && v && /* @__PURE__ */ S.jsx(Ro, {
        "data-type": "outside",
        ref: R,
        onFocus: (O) => {
          if (Wr(O, v))
            D.current?.focus();
          else {
            const k = T ? T.domReference : null;
            Hp(k)?.focus(), T?.closeOnFocusOut && T?.onOpenChange(!1, Ye(To, O.nativeEvent));
          }
        }
      })]
    })]
  });
});
function M0() {
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
class Lp {
  nodesRef = {
    current: []
  };
  events = M0();
  addNode(o) {
    this.nodesRef.current.push(o);
  }
  removeNode(o) {
    const a = this.nodesRef.current.findIndex((i) => i === o);
    a !== -1 && this.nodesRef.current.splice(a, 1);
  }
}
const A0 = /* @__PURE__ */ y.createContext(null), z0 = /* @__PURE__ */ y.createContext(null), Kl = () => y.useContext(A0)?.id || null, No = (n) => {
  const o = y.useContext(z0);
  return n ?? o;
};
function Ip(n) {
  const o = rr(), a = No(n), i = Kl();
  return xe(() => {
    if (!o)
      return;
    const c = {
      id: o,
      parentId: i
    };
    return a?.addNode(c), () => {
      a?.removeNode(c);
    };
  }, [a, o, i]), o;
}
function D0(n) {
  const {
    children: o,
    id: a
  } = n, i = Kl();
  return /* @__PURE__ */ S.jsx(A0.Provider, {
    value: y.useMemo(() => ({
      id: a,
      parentId: i
    }), [a, i]),
    children: o
  });
}
function N0(n) {
  const {
    children: o,
    externalTree: a
  } = n, i = xn(() => a ?? new Lp()).current;
  return /* @__PURE__ */ S.jsx(z0.Provider, {
    value: i,
    children: o
  });
}
function Ul(n) {
  return n == null ? n : "current" in n ? n.current : n;
}
function HR(n, o) {
  const a = zt(gn(n));
  return n instanceof a.KeyboardEvent ? "keyboard" : n instanceof a.FocusEvent ? o || "keyboard" : "pointerType" in n ? n.pointerType || "keyboard" : "touches" in n ? "touch" : n instanceof a.MouseEvent ? o || (n.detail === 0 ? "keyboard" : "mouse") : "";
}
const Iv = 20;
let wo = [];
function Bp() {
  wo = wo.filter((n) => n.deref()?.isConnected);
}
function Bv(n) {
  Bp(), n && mn(n) !== "body" && (wo.push(new WeakRef(n)), wo.length > Iv && (wo = wo.slice(-Iv)));
}
function Vv() {
  return Bp(), wo[wo.length - 1]?.deref();
}
function UR(n) {
  return n ? _p(n) ? n : wi(n)[0] || n : null;
}
function Pv(n) {
  if (n.hasAttribute("tabindex") && !n.hasAttribute("data-tabindex") || !n.getAttribute("role")?.includes("dialog"))
    return;
  const a = y0(n).filter((c) => {
    const f = c.getAttribute("data-tabindex") || "";
    return _p(c) || c.hasAttribute("data-tabindex") && !f.startsWith("-");
  }), i = n.getAttribute("tabindex");
  a.length === 0 ? i !== "0" && (n.setAttribute("tabindex", "0"), n.setAttribute("data-tabindex", "0")) : (i !== "-1" || n.hasAttribute("data-tabindex") && n.getAttribute("data-tabindex") !== "-1") && (n.setAttribute("tabindex", "-1"), n.setAttribute("data-tabindex", "-1"));
}
function Iu(n) {
  const {
    context: o,
    children: a,
    disabled: i = !1,
    initialFocus: c = !0,
    returnFocus: f = !0,
    restoreFocus: p = !1,
    modal: g = !0,
    closeOnFocusOut: m = !0,
    openInteractionType: d = "",
    nextFocusableElement: v,
    previousFocusableElement: b,
    beforeContentFocusGuardRef: x,
    externalTree: R,
    getInsideElements: w
  } = n, D = "rootStore" in o ? o.rootStore : o, T = D.useState("open"), N = D.useState("domReferenceElement"), A = D.useState("floatingElement"), {
    events: E,
    dataRef: z
  } = D.context, U = ze(() => z.current.floatingContext?.nodeId), j = c === !1, O = np(N) && j, k = Yt(c), G = Yt(f), P = Yt(d), ne = Yt(T), K = No(R), Q = C0(), Z = y.useRef(!1), q = y.useRef(!1), _ = y.useRef(!1), Y = y.useRef(null), B = y.useRef(""), F = y.useRef(""), I = y.useRef(null), M = y.useRef(null), H = Eo(I, x, Q?.beforeInsideRef), te = Eo(M, Q?.afterInsideRef), J = an(), re = an(), ie = na(), oe = Q != null, se = mu(A), ge = ze((fe = se) => fe ? wi(fe) : []), je = ze(() => w?.().filter((fe) => fe != null) ?? []);
  y.useEffect(() => {
    if (i || !g)
      return;
    function fe(Re) {
      Re.key === "Tab" && Le(se, vn(tt(se))) && ge().length === 0 && !O && fl(Re);
    }
    const ye = tt(se);
    return Je(ye, "keydown", fe);
  }, [i, se, g, O, ge]), y.useEffect(() => {
    if (i || !T)
      return;
    const fe = tt(se);
    function ye() {
      _.current = !1;
    }
    function Re(ke) {
      const we = gn(ke), Ce = je(), he = Le(A, we) || Le(N, we) || Le(Q?.portalNode, we) || Ce.some((Se) => Se === we || Le(Se, we));
      _.current = !he, F.current = ke.pointerType || "keyboard", we?.closest(`[${E0}]`) && (q.current = !0, re.start(0, () => {
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
  }, [i, A, N, se, T, Q, re, je]), y.useEffect(() => {
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
      _p(he) && (Y.current = he);
    }
    function _e(Ce) {
      const he = Ce.relatedTarget, Se = Ce.currentTarget, Te = gn(Ce);
      g && he == null && Te != null && Le(A, Te) && Bv(Te), queueMicrotask(() => {
        const Oe = U(), He = D.context.triggerElements, ae = je(), pe = he?.hasAttribute(vi("focus-guard")) && [I.current, M.current, Q?.beforeInsideRef.current, Q?.afterInsideRef.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, Ul(b), Ul(v)].includes(he), Ue = !(Le(N, he) || Le(A, he) || Le(he, A) || Le(Q?.portalNode, he) || ae.some((ve) => ve === he || Le(ve, he)) || he != null && He.hasElement(he) || He.hasMatchingElement((ve) => Le(ve, he)) || pe || K && (Co(K.nodesRef.current, Oe).find((ve) => Le(ve.context?.elements.floating, he) || Le(ve.context?.elements.domReference, he)) || Dv(K.nodesRef.current, Oe).find((ve) => [ve.context?.elements.floating, mu(ve.context?.elements.floating)].includes(he) || ve.context?.elements.domReference === he)));
        if (Se === N && se && Pv(se), p && Se !== N && !Uu(Te) && vn(fe) === fe.body) {
          if (Rt(se) && (se.focus(), p === "popup")) {
            ie.request(() => {
              se.focus();
            });
            return;
          }
          const ve = ge(), be = Y.current, We = (be && ve.includes(be) ? be : null) || ve[ve.length - 1] || se;
          Rt(We) && We.focus();
        }
        if (z.current.insideReactTree) {
          z.current.insideReactTree = !1;
          return;
        }
        (O || !g) && he && Ue && !q.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (O || he !== Vv()) && (Z.current = !0, D.setOpen(!1, Ye(To, Ce)));
      });
    }
    function ke() {
      _.current || (z.current.insideReactTree = !0, J.start(0, () => {
        z.current.insideReactTree = !1;
      }));
    }
    const we = Rt(N) ? N : null;
    if (!(!A && !we))
      return pl(we && Je(we, "focusout", _e), we && Je(we, "pointerdown", ye), A && Je(A, "focusin", Re), A && Je(A, "focusout", _e), A && Q && Je(A, "focusout", ke, !0));
  }, [i, N, A, se, g, K, Q, D, m, p, ge, O, U, z, J, re, ie, v, b, je]), y.useEffect(() => {
    if (i || !A || !T)
      return;
    const fe = Array.from(Q?.portalNode?.querySelectorAll(`[${vi("portal")}]`) || []), Re = (K ? Dv(K.nodesRef.current, U()) : []).find((Se) => np(Se.context?.elements.domReference || null))?.context?.elements.domReference, ke = [...[A, ...fe, I.current, M.current, Q?.beforeOutsideRef.current, Q?.afterOutsideRef.current, ...je()], Re, Ul(b), Ul(v), O ? N : null].filter((Se) => Se != null), we = Hv(ke, {
      ariaHidden: g || O,
      mark: !1
    }), Ce = [A, ...fe].filter((Se) => Se != null), he = Hv(Ce);
    return () => {
      he(), we();
    };
  }, [T, i, N, A, g, Q, O, K, U, v, b, je]), xe(() => {
    if (!T || i || !Rt(se))
      return;
    const fe = tt(se), ye = vn(fe);
    queueMicrotask(() => {
      const Re = k.current, _e = typeof Re == "function" ? Re(P.current || "") : Re;
      if (_e === void 0 || _e === !1 || Le(se, ye))
        return;
      let we = null;
      const Ce = () => (we == null && (we = ge(se)), we[0] || se);
      let he;
      _e === !0 || _e === null ? he = Ce() : he = Ul(_e), he = he || Ce();
      const Se = Le(se, vn(fe));
      au(he, {
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
  }, [i, T, se, ge, k, P, ne]), xe(() => {
    if (i || !se)
      return;
    const fe = tt(se), ye = vn(fe), Re = P.current == null;
    Bv(ye);
    function _e(we) {
      if (we.open || (B.current = HR(we.nativeEvent, F.current)), we.reason === Pt && we.nativeEvent.type === "mouseleave" && (Z.current = !0), we.reason === _u)
        if (we.nested)
          Z.current = !1;
        else if (zp(we.nativeEvent) || e0(we.nativeEvent))
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
    E.on("openchange", _e);
    function ke() {
      const we = G.current;
      let Ce = typeof we == "function" ? we(B.current) : we;
      if (Ce === void 0 || Ce === !1)
        return null;
      Ce === null && (Ce = !0);
      const he = N?.isConnected ? N : null, Se = ye?.isConnected && mn(ye) !== "body" ? ye : null;
      let Te = Re ? Se || he : he || Se;
      return Te || (Te = Vv() || null), typeof Ce == "boolean" ? Te : Ul(Ce) || Te || null;
    }
    return () => {
      E.off("openchange", _e);
      const we = vn(fe), Ce = je(), he = Le(A, we) || Ce.some((Oe) => Oe === we || Le(Oe, we)) || K && Co(K.nodesRef.current, U(), !1).some((Oe) => Le(Oe.context?.elements.floating, we)), Se = G.current, Te = ke();
      queueMicrotask(() => {
        const Oe = UR(Te), He = typeof Se != "boolean";
        Se && !Z.current && Rt(Oe) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!(!He && Oe !== we && we !== fe.body) || he) && Oe.focus({
          preventScroll: !0
        }), Z.current = !1;
      });
    };
  }, [i, A, se, G, P, E, K, N, U, je]), xe(() => {
    if (!Ao || T || !A)
      return;
    const fe = vn(tt(A));
    !Rt(fe) || !ku(fe) || Le(A, fe) && fe.blur();
  }, [T, A]), xe(() => {
    if (!(i || !Q))
      return Q.setFocusManagerState({
        modal: g,
        closeOnFocusOut: m,
        open: T,
        onOpenChange: D.setOpen,
        domReference: N
      }), () => {
        Q.setFocusManagerState(null);
      };
  }, [i, Q, g, T, D, m, N]), xe(() => {
    if (!(i || !se))
      return Pv(se), () => {
        queueMicrotask(Bp);
      };
  }, [i, se]);
  const Ee = !i && (g ? !O : !0) && (oe || g);
  return /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [Ee && /* @__PURE__ */ S.jsx(Ro, {
      "data-type": "inside",
      ref: H,
      onFocus: (fe) => {
        if (g) {
          const ye = ge();
          au(ye[ye.length - 1]);
        } else Q?.portalNode && (Z.current = !1, Wr(fe, Q.portalNode) ? Hp(N)?.focus() : Ul(b ?? Q.beforeOutsideRef)?.focus());
      }
    }), a, Ee && /* @__PURE__ */ S.jsx(Ro, {
      "data-type": "inside",
      ref: te,
      onFocus: (fe) => {
        g ? au(ge()[0]) : Q?.portalNode && (m && (Z.current = !0), Wr(fe, Q.portalNode) ? b0(N)?.focus() : Ul(v ?? Q.afterOutsideRef)?.focus());
      }
    })]
  });
}
function Bu(n, o = {}) {
  const {
    enabled: a = !0,
    event: i = "click",
    toggle: c = !0,
    ignoreMouse: f = !1,
    stickIfOpen: p = !0,
    touchOpenDelay: g = 0,
    reason: m = ql
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.context.dataRef, b = y.useRef(void 0), x = na(), R = an(), w = y.useMemo(() => {
    function D(N, A, E, z) {
      const U = Ye(m, A, E);
      N && z === "touch" && g > 0 ? R.start(g, () => {
        d.setOpen(!0, U);
      }) : d.setOpen(N, U);
    }
    function T(N, A, E) {
      const z = v.current.openEvent, U = d.select("domReferenceElement") !== A;
      return N && U || !N || !c ? !0 : z && p ? !E(z.type) : !1;
    }
    return {
      onPointerDown(N) {
        b.current = N.pointerType;
      },
      onMouseDown(N) {
        const A = b.current, E = N.nativeEvent, z = d.select("open");
        if (N.button !== 0 || i === "click" || or(A, !0) && f)
          return;
        const U = T(z, N.currentTarget, (k) => k === "click" || k === "mousedown"), j = gn(E);
        if (ku(j)) {
          D(U, E, j, A);
          return;
        }
        const O = N.currentTarget;
        x.request(() => {
          D(U, E, O, A);
        });
      },
      onClick(N) {
        if (i === "mousedown-only")
          return;
        const A = b.current;
        if (i === "mousedown" && A) {
          b.current = void 0;
          return;
        }
        if (or(A, !0) && f)
          return;
        const E = d.select("open"), z = T(E, N.currentTarget, (U) => U === "click" || U === "mousedown" || U === "keydown" || U === "keyup");
        D(z, N.nativeEvent, N.currentTarget, A);
      },
      onKeyDown() {
        b.current = void 0;
      }
    };
  }, [v, i, f, m, d, p, c, x, R, g]);
  return y.useMemo(() => a ? {
    reference: w
  } : bt, [a, w]);
}
function LR(n, o) {
  let a = null, i = null, c = !1;
  return {
    contextElement: n || void 0,
    getBoundingClientRect() {
      const f = n?.getBoundingClientRect() || {
        width: 0,
        height: 0,
        x: 0,
        y: 0
      }, p = o.axis === "x" || o.axis === "both", g = o.axis === "y" || o.axis === "both", m = ["mouseenter", "mousemove"].includes(o.dataRef.current.openEvent?.type || "") && o.pointerType !== "touch";
      let d = f.width, v = f.height, b = f.x, x = f.y;
      return a == null && o.x && p && (a = f.x - o.x), i == null && o.y && g && (i = f.y - o.y), b -= a || 0, x -= i || 0, d = 0, v = 0, !c || m ? (d = o.axis === "y" ? f.width : 0, v = o.axis === "x" ? f.height : 0, b = p && o.x != null ? o.x : b, x = g && o.y != null ? o.y : x) : c && !m && (v = o.axis === "x" ? f.height : v, d = o.axis === "y" ? f.width : d), c = !0, {
        width: d,
        height: v,
        x: b,
        y: x,
        top: x,
        right: b + d,
        bottom: x + v,
        left: b
      };
    }
  };
}
function Yv(n) {
  return n != null && n.clientX != null;
}
function IR(n, o = {}) {
  const {
    enabled: a = !0,
    axis: i = "both"
  } = o, c = "rootStore" in n ? n.rootStore : n, f = c.useState("open"), p = c.useState("floatingElement"), g = c.useState("domReferenceElement"), m = c.context.dataRef, d = y.useRef(!1), v = y.useRef(null), [b, x] = y.useState(), [R, w] = y.useState([]), D = ze((z) => {
    c.set("positionReference", z);
  }), T = ze((z, U, j) => {
    d.current || m.current.openEvent && !Yv(m.current.openEvent) || c.set("positionReference", LR(j ?? g, {
      x: z,
      y: U,
      axis: i,
      dataRef: m,
      pointerType: b
    }));
  }), N = ze((z) => {
    f ? v.current || (T(z.clientX, z.clientY, z.currentTarget), w([])) : T(z.clientX, z.clientY, z.currentTarget);
  }), A = or(b) ? p : f;
  y.useEffect(() => {
    if (!a) {
      D(g);
      return;
    }
    if (!A)
      return;
    function z() {
      v.current?.(), v.current = null;
    }
    const U = zt(p);
    function j(O) {
      const k = gn(O);
      Le(p, k) ? z() : T(O.clientX, O.clientY);
    }
    return !m.current.openEvent || Yv(m.current.openEvent) ? v.current = Je(U, "mousemove", j) : D(g), z;
  }, [A, a, p, m, g, c, T, D, R]), y.useEffect(() => () => {
    c.set("positionReference", null);
  }, [c]), y.useEffect(() => {
    a && !p && (d.current = !1);
  }, [a, p]), y.useEffect(() => {
    !a && f && (d.current = !0);
  }, [a, f]);
  const E = y.useMemo(() => {
    function z(U) {
      x(U.pointerType);
    }
    return {
      onPointerDown: z,
      onPointerEnter: z,
      onMouseMove: N,
      onMouseEnter: N
    };
  }, [N]);
  return y.useMemo(() => a ? {
    reference: E,
    trigger: E
  } : {}, [a, E]);
}
function BR() {
  return !1;
}
function VR(n) {
  return {
    escapeKey: typeof n == "boolean" ? n : n?.escapeKey ?? !1,
    outsidePress: typeof n == "boolean" ? n : n?.outsidePress ?? !0
  };
}
function Ei(n, o = {}) {
  const {
    enabled: a = !0,
    escapeKey: i = !0,
    outsidePress: c = !0,
    outsidePressEvent: f = "sloppy",
    referencePress: p = BR,
    bubbles: g,
    externalTree: m
  } = o, d = "rootStore" in n ? n.rootStore : n, v = d.useState("open"), b = d.useState("floatingElement"), {
    dataRef: x
  } = d.context, R = No(m), w = ze(typeof c == "function" ? c : () => !1), D = typeof c == "function" ? w : c, T = D !== !1, N = ze(() => f), {
    escapeKey: A,
    outsidePress: E
  } = VR(g), z = y.useRef(!1), U = y.useRef(!1), j = y.useRef(!1), O = y.useRef(!1), k = y.useRef(""), G = y.useRef(null), P = an(), ne = an(), K = ze(() => {
    ne.clear(), x.current.insideReactTree = !1;
  }), Q = ze((H) => {
    const te = x.current.floatingContext?.nodeId;
    return (R ? Co(R.nodesRef.current, te) : []).some((re) => re.context?.open && !re.context.dataRef.current[H]);
  }), Z = ze((H) => Dd(H, d.select("floatingElement")) || Dd(H, d.select("domReferenceElement"))), q = ze((H) => {
    p() && d.setOpen(!1, Ye(ql, H.nativeEvent));
  }), _ = ze((H) => {
    if (!v || !a || !i || H.key !== "Escape" || O.current || !A && Q("__escapeKeyBubbles"))
      return;
    const te = JT(H) ? H.nativeEvent : H, J = Ye(Si, te);
    d.setOpen(!1, J), J.isCanceled || H.preventDefault(), !A && !J.isPropagationAllowed && H.stopPropagation();
  }), Y = ze(() => {
    x.current.insideReactTree = !0, ne.start(0, K);
  }), B = ze((H) => {
    if (!v || !a || H.button !== 0)
      return;
    const te = gn(H.nativeEvent);
    Le(d.select("floatingElement"), te) && (z.current || (z.current = !0, U.current = !1));
  }), F = ze((H) => {
    !v || !a || (H.defaultPrevented || H.nativeEvent.defaultPrevented) && z.current && (U.current = !0);
  });
  y.useEffect(() => {
    if (!v || !a)
      return;
    x.current.__escapeKeyBubbles = A, x.current.__outsidePressBubbles = E;
    const H = new el(), te = new el();
    function J() {
      H.clear(), O.current = !0;
    }
    function re() {
      H.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        Ao ? 5 : 0,
        () => {
          O.current = !1;
        }
      );
    }
    function ie() {
      j.current = !0, te.start(0, () => {
        j.current = !1;
      });
    }
    function oe() {
      z.current = !1, U.current = !1;
    }
    function se() {
      const ae = k.current, pe = ae === "pen" || !ae ? "mouse" : ae, Ue = N(), ve = typeof Ue == "function" ? Ue() : Ue;
      return typeof ve == "string" ? ve : ve[pe];
    }
    function ge(ae) {
      const pe = se();
      return pe === "intentional" && ae.type !== "click" || pe === "sloppy" && ae.type === "click";
    }
    function je(ae) {
      const pe = x.current.floatingContext?.nodeId, Ue = R && Co(R.nodesRef.current, pe).some((ve) => Dd(ae, ve.context?.elements.floating));
      return Z(ae) || Ue;
    }
    function Ee(ae) {
      if (ge(ae)) {
        ae.type !== "click" && !Z(ae) && (te.clear(), j.current = !1), K();
        return;
      }
      if (x.current.insideReactTree) {
        K();
        return;
      }
      const pe = gn(ae), Ue = `[${vi("inert")}]`, ve = $e(pe) ? pe.getRootNode() : null, be = Array.from((ta(ve) ? ve : tt(d.select("floatingElement"))).querySelectorAll(Ue)), We = d.context.triggerElements;
      if (pe && (We.hasElement(pe) || We.hasMatchingElement((pt) => Le(pt, pe))))
        return;
      let rt = $e(pe) ? pe : null;
      for (; rt && !Bl(rt); ) {
        const pt = Yl(rt);
        if (Bl(pt) || !$e(pt))
          break;
        rt = pt;
      }
      if (!(be.length && $e(pe) && !WT(pe) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !Le(pe, d.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      be.every((pt) => !Le(rt, pt)))) {
        if (Rt(pe) && !("touches" in ae)) {
          const pt = Bl(pe), Dt = In(pe), et = /auto|scroll/, gt = pt || et.test(Dt.overflowX), At = pt || et.test(Dt.overflowY), mt = gt && pe.clientWidth > 0 && pe.scrollWidth > pe.clientWidth, Mn = At && pe.clientHeight > 0 && pe.scrollHeight > pe.clientHeight, An = Dt.direction === "rtl", Qe = Mn && (An ? ae.offsetX <= pe.offsetWidth - pe.clientWidth : ae.offsetX > pe.clientWidth), ft = mt && ae.offsetY > pe.clientHeight;
          if (Qe || ft)
            return;
        }
        if (!je(ae)) {
          if (se() === "intentional" && j.current) {
            te.clear(), j.current = !1;
            return;
          }
          typeof D == "function" && !D(ae) || Q("__outsidePressBubbles") || (d.setOpen(!1, Ye(_u, ae)), K());
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
      }, P.start(1e3, () => {
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
      P.clear(), ae.type === "pointerdown" && (k.current = ae.pointerType), !(ae.type === "mousedown" && G.current && !G.current.dismissOnMouseDown) && Re(ae, (pe) => {
        pe.type === "pointerdown" ? fe(pe) : Ee(pe);
      });
    }
    function we(ae) {
      if (!z.current)
        return;
      const pe = U.current;
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
          typeof D == "function" && !D(ae) || (te.clear(), j.current = !0, K());
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
      be > 5 && (G.current.dismissOnTouchEnd = !0), be > 10 && (Ee(ae), P.clear(), G.current = null);
    }
    function he(ae) {
      Re(ae, Ce);
    }
    function Se(ae) {
      se() !== "sloppy" || !G.current || Z(ae) || (G.current.dismissOnTouchEnd && Ee(ae), P.clear(), G.current = null);
    }
    function Te(ae) {
      Re(ae, Se);
    }
    const Oe = tt(b), He = pl(i && pl(Je(Oe, "keydown", _), Je(Oe, "compositionstart", J), Je(Oe, "compositionend", re)), T && pl(Je(Oe, "click", ke, !0), Je(Oe, "pointerdown", ke, !0), Je(Oe, "pointerup", we, !0), Je(Oe, "pointercancel", we, !0), Je(Oe, "mousedown", ke, !0), Je(Oe, "mouseup", we, !0), Je(Oe, "touchstart", _e, !0), Je(Oe, "touchmove", he, !0), Je(Oe, "touchend", Te, !0)));
    return () => {
      He(), H.clear(), te.clear(), oe(), j.current = !1;
    };
  }, [x, b, i, T, D, v, a, A, E, _, K, N, Q, Z, R, d, P]), y.useEffect(K, [D, K]);
  const I = y.useMemo(() => ({
    onKeyDown: _,
    onPointerDown: q,
    onClick: q
  }), [_, q]), M = y.useMemo(() => ({
    onKeyDown: _,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: F,
    onMouseDown: F,
    onClickCapture: Y,
    onMouseDownCapture(H) {
      Y(), B(H);
    },
    onPointerDownCapture(H) {
      Y(), B(H);
    },
    onMouseUpCapture: Y,
    onTouchEndCapture: Y,
    onTouchMoveCapture: Y
  }), [_, Y, B, F]);
  return y.useMemo(() => a ? {
    reference: I,
    floating: M,
    trigger: I
  } : {}, [a, I, M]);
}
function Gv(n, o, a) {
  let {
    reference: i,
    floating: c
  } = n;
  const f = Wn(o), p = kp(o), g = jp(p), m = Ln(o), d = f === "y", v = i.x + i.width / 2 - c.width / 2, b = i.y + i.height / 2 - c.height / 2, x = i[g] / 2 - c[g] / 2;
  let R;
  switch (m) {
    case "top":
      R = {
        x: v,
        y: i.y - c.height
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
        x: i.x - c.width,
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
  return w && (R[p] += x * (w === "end" ? 1 : -1) * (a && d ? -1 : 1)), R;
}
async function PR(n, o) {
  var a;
  o === void 0 && (o = {});
  const {
    x: i,
    y: c,
    platform: f,
    rects: p,
    elements: g,
    strategy: m
  } = n, {
    boundary: d = "clippingAncestors",
    rootBoundary: v = "viewport",
    elementContext: b = "floating",
    altBoundary: x = !1,
    padding: R = 0
  } = Xl(o, n), w = c0(R), T = g[x ? b === "floating" ? "reference" : "floating" : b], N = yi(await f.getClippingRect({
    element: (a = await (f.isElement == null ? void 0 : f.isElement(T))) == null || a ? T : T.contextElement || await (f.getDocumentElement == null ? void 0 : f.getDocumentElement(g.floating)),
    boundary: d,
    rootBoundary: v,
    strategy: m
  })), A = b === "floating" ? {
    x: i,
    y: c,
    width: p.floating.width,
    height: p.floating.height
  } : p.reference, E = await (f.getOffsetParent == null ? void 0 : f.getOffsetParent(g.floating)), z = await (f.isElement == null ? void 0 : f.isElement(E)) && await (f.getScale == null ? void 0 : f.getScale(E)) || {
    x: 1,
    y: 1
  }, U = yi(f.convertOffsetParentRelativeRectToViewportRelativeRect ? await f.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: g,
    rect: A,
    offsetParent: E,
    strategy: m
  }) : A);
  return {
    top: (N.top - U.top + w.top) / z.y,
    bottom: (U.bottom - N.bottom + w.bottom) / z.y,
    left: (N.left - U.left + w.left) / z.x,
    right: (U.right - N.right + w.right) / z.x
  };
}
const YR = 50, GR = async (n, o, a) => {
  const {
    placement: i = "bottom",
    strategy: c = "absolute",
    middleware: f = [],
    platform: p
  } = a, g = p.detectOverflow ? p : {
    ...p,
    detectOverflow: PR
  }, m = await (p.isRTL == null ? void 0 : p.isRTL(o));
  let d = await p.getElementRects({
    reference: n,
    floating: o,
    strategy: c
  }), {
    x: v,
    y: b
  } = Gv(d, i, m), x = i, R = 0;
  const w = {};
  for (let D = 0; D < f.length; D++) {
    const T = f[D];
    if (!T)
      continue;
    const {
      name: N,
      fn: A
    } = T, {
      x: E,
      y: z,
      data: U,
      reset: j
    } = await A({
      x: v,
      y: b,
      initialPlacement: i,
      placement: x,
      strategy: c,
      middlewareData: w,
      rects: d,
      platform: g,
      elements: {
        reference: n,
        floating: o
      }
    });
    v = E ?? v, b = z ?? b, w[N] = {
      ...w[N],
      ...U
    }, j && R < YR && (R++, typeof j == "object" && (j.placement && (x = j.placement), j.rects && (d = j.rects === !0 ? await p.getElementRects({
      reference: n,
      floating: o,
      strategy: c
    }) : j.rects), {
      x: v,
      y: b
    } = Gv(d, x, m)), D = -1);
  }
  return {
    x: v,
    y: b,
    placement: x,
    strategy: c,
    middlewareData: w
  };
}, qR = function(n) {
  return n === void 0 && (n = {}), {
    name: "flip",
    options: n,
    async fn(o) {
      var a, i;
      const {
        placement: c,
        middlewareData: f,
        rects: p,
        initialPlacement: g,
        platform: m,
        elements: d
      } = o, {
        mainAxis: v = !0,
        crossAxis: b = !0,
        fallbackPlacements: x,
        fallbackStrategy: R = "bestFit",
        fallbackAxisSideDirection: w = "none",
        flipAlignment: D = !0,
        ...T
      } = Xl(n, o);
      if ((a = f.arrow) != null && a.alignmentOffset)
        return {};
      const N = Ln(c), A = Wn(g), E = Ln(g) === g, z = await (m.isRTL == null ? void 0 : m.isRTL(d.floating)), U = x || (E || !D ? [yu(g)] : gR(g)), j = w !== "none";
      !x && j && U.push(...vR(g, D, w, z));
      const O = [g, ...U], k = await m.detectOverflow(o, T), G = [];
      let P = ((i = f.flip) == null ? void 0 : i.overflows) || [];
      if (v && G.push(k[N]), b) {
        const Z = pR(c, p, z);
        G.push(k[Z[0]], k[Z[1]]);
      }
      if (P = [...P, {
        placement: c,
        overflows: G
      }], !G.every((Z) => Z <= 0)) {
        var ne, K;
        const Z = (((ne = f.flip) == null ? void 0 : ne.index) || 0) + 1, q = O[Z];
        if (q && (!(b === "alignment" ? A !== Wn(q) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        P.every((B) => Wn(B.placement) === A ? B.overflows[0] > 0 : !0)))
          return {
            data: {
              index: Z,
              overflows: P
            },
            reset: {
              placement: q
            }
          };
        let _ = (K = P.filter((Y) => Y.overflows[0] <= 0).sort((Y, B) => Y.overflows[1] - B.overflows[1])[0]) == null ? void 0 : K.placement;
        if (!_)
          switch (R) {
            case "bestFit": {
              var Q;
              const Y = (Q = P.filter((B) => {
                if (j) {
                  const F = Wn(B.placement);
                  return F === A || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  F === "y";
                }
                return !0;
              }).map((B) => [B.placement, B.overflows.filter((F) => F > 0).reduce((F, I) => F + I, 0)]).sort((B, F) => B[1] - F[1])[0]) == null ? void 0 : Q[0];
              Y && (_ = Y);
              break;
            }
            case "initialPlacement":
              _ = g;
              break;
          }
        if (c !== _)
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
function qv(n, o) {
  return {
    top: n.top - o.height,
    right: n.right - o.width,
    bottom: n.bottom - o.height,
    left: n.left - o.width
  };
}
function Xv(n) {
  return fR.some((o) => n[o] >= 0);
}
const XR = function(n) {
  return n === void 0 && (n = {}), {
    name: "hide",
    options: n,
    async fn(o) {
      const {
        rects: a,
        platform: i
      } = o, {
        strategy: c = "referenceHidden",
        ...f
      } = Xl(n, o);
      switch (c) {
        case "referenceHidden": {
          const p = await i.detectOverflow(o, {
            ...f,
            elementContext: "reference"
          }), g = qv(p, a.reference);
          return {
            data: {
              referenceHiddenOffsets: g,
              referenceHidden: Xv(g)
            }
          };
        }
        case "escaped": {
          const p = await i.detectOverflow(o, {
            ...f,
            altBoundary: !0
          }), g = qv(p, a.floating);
          return {
            data: {
              escapedOffsets: g,
              escaped: Xv(g)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, j0 = /* @__PURE__ */ new Set(["left", "top"]);
async function FR(n, o) {
  const {
    placement: a,
    platform: i,
    elements: c
  } = n, f = await (i.isRTL == null ? void 0 : i.isRTL(c.floating)), p = Ln(a), g = Do(a), m = Wn(a) === "y", d = j0.has(p) ? -1 : 1, v = f && m ? -1 : 1, b = Xl(o, n);
  let {
    mainAxis: x,
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
    y: x * d
  } : {
    x: x * d,
    y: R * v
  };
}
const KR = function(n) {
  return n === void 0 && (n = 0), {
    name: "offset",
    options: n,
    async fn(o) {
      var a, i;
      const {
        x: c,
        y: f,
        placement: p,
        middlewareData: g
      } = o, m = await FR(o, n);
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
}, QR = function(n) {
  return n === void 0 && (n = {}), {
    name: "shift",
    options: n,
    async fn(o) {
      const {
        x: a,
        y: i,
        placement: c,
        platform: f
      } = o, {
        mainAxis: p = !0,
        crossAxis: g = !1,
        limiter: m = {
          fn: (A) => {
            let {
              x: E,
              y: z
            } = A;
            return {
              x: E,
              y: z
            };
          }
        },
        ...d
      } = Xl(n, o), v = {
        x: a,
        y: i
      }, b = await f.detectOverflow(o, d), x = Wn(c), R = Np(x);
      let w = v[R], D = v[x];
      const T = (A, E) => u0(E + b[A === "y" ? "top" : "left"], E, E - b[A === "y" ? "bottom" : "right"]);
      p && (w = T(R, w)), g && (D = T(x, D));
      const N = m.fn({
        ...o,
        [R]: w,
        [x]: D
      });
      return {
        ...N,
        data: {
          x: N.x - a,
          y: N.y - i,
          enabled: {
            [R]: p,
            [x]: g
          }
        }
      };
    }
  };
}, ZR = function(n) {
  return n === void 0 && (n = {}), {
    options: n,
    fn(o) {
      var a, i;
      const {
        x: c,
        y: f,
        placement: p,
        rects: g,
        middlewareData: m
      } = o, {
        offset: d = 0,
        mainAxis: v = !0,
        crossAxis: b = !0
      } = Xl(n, o), x = {
        x: c,
        y: f
      }, R = Wn(p), w = Np(R);
      let D = x[w], T = x[R];
      const N = Xl(d, o), A = typeof N == "number" ? {
        mainAxis: N,
        crossAxis: 0
      } : {
        mainAxis: (a = N.mainAxis) != null ? a : 0,
        crossAxis: (i = N.crossAxis) != null ? i : 0
      };
      if (v) {
        const U = w === "y" ? "height" : "width", j = g.reference[w] - g.floating[U] + A.mainAxis, O = g.reference[w] + g.reference[U] - A.mainAxis;
        D < j ? D = j : D > O && (D = O);
      }
      if (b) {
        var E, z;
        const U = w === "y" ? "width" : "height", j = j0.has(Ln(p)), O = g.reference[R] - g.floating[U] + (j && ((E = m.offset) == null ? void 0 : E[R]) || 0) + (j ? 0 : A.crossAxis), k = g.reference[R] + g.reference[U] + (j ? 0 : ((z = m.offset) == null ? void 0 : z[R]) || 0) - (j ? A.crossAxis : 0);
        T < O ? T = O : T > k && (T = k);
      }
      return {
        [w]: D,
        [R]: T
      };
    }
  };
}, JR = function(n) {
  return n === void 0 && (n = {}), {
    name: "size",
    options: n,
    async fn(o) {
      const {
        placement: a,
        rects: i,
        platform: c,
        elements: f
      } = o, {
        apply: p = () => {
        },
        ...g
      } = Xl(n, o), m = await c.detectOverflow(o, g), d = Ln(a), v = Do(a), b = Wn(a) === "y", {
        width: x,
        height: R
      } = i.floating;
      let w, D;
      d === "top" || d === "bottom" ? (w = d, D = v === (await (c.isRTL == null ? void 0 : c.isRTL(f.floating)) ? "start" : "end") ? "left" : "right") : (D = d, w = v === "end" ? "top" : "bottom");
      const T = R - m.top - m.bottom, N = x - m.left - m.right, A = oa(R - m[w], T), E = oa(x - m[D], N), z = o.middlewareData.shift, U = !z;
      let j = A, O = E;
      z != null && z.enabled.x && (O = N), z != null && z.enabled.y && (j = T), U && !v && (b ? O = x - 2 * Vl(m.left, m.right) : j = R - 2 * Vl(m.top, m.bottom)), await p({
        ...o,
        availableWidth: O,
        availableHeight: j
      });
      const k = await c.getDimensions(f.floating);
      return x !== k.width || R !== k.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function k0(n) {
  const o = In(n);
  let a = parseFloat(o.width) || 0, i = parseFloat(o.height) || 0;
  const c = Rt(n), f = c ? n.offsetWidth : a, p = c ? n.offsetHeight : i, g = hu(a) !== f || hu(i) !== p;
  return g && (a = f, i = p), {
    width: a,
    height: i,
    $: g
  };
}
function Vp(n) {
  return $e(n) ? n : n.contextElement;
}
function ea(n) {
  const o = Vp(n);
  if (!Rt(o))
    return Pl(1);
  const a = o.getBoundingClientRect(), {
    width: i,
    height: c,
    $: f
  } = k0(o);
  let p = (f ? hu(a.width) : a.width) / i, g = (f ? hu(a.height) : a.height) / c;
  return (!p || !Number.isFinite(p)) && (p = 1), (!g || !Number.isFinite(g)) && (g = 1), {
    x: p,
    y: g
  };
}
const $R = /* @__PURE__ */ Pl(0);
function _0(n) {
  const o = zt(n);
  return !vp() || !o.visualViewport ? $R : {
    x: o.visualViewport.offsetLeft,
    y: o.visualViewport.offsetTop
  };
}
function WR(n, o, a) {
  return o === void 0 && (o = !1), !!a && o && a === zt(n);
}
function ar(n, o, a, i) {
  o === void 0 && (o = !1), a === void 0 && (a = !1);
  const c = n.getBoundingClientRect(), f = Vp(n);
  let p = Pl(1);
  o && (i ? $e(i) && (p = ea(i)) : p = ea(n));
  const g = WR(f, a, i) ? _0(f) : Pl(0);
  let m = (c.left + g.x) / p.x, d = (c.top + g.y) / p.y, v = c.width / p.x, b = c.height / p.y;
  if (f && i) {
    const x = zt(f), R = $e(i) ? zt(i) : i;
    let w = x, D = Jd(w);
    for (; D && R !== w; ) {
      const T = ea(D), N = D.getBoundingClientRect(), A = In(D), E = N.left + (D.clientLeft + parseFloat(A.paddingLeft)) * T.x, z = N.top + (D.clientTop + parseFloat(A.paddingTop)) * T.y;
      m *= T.x, d *= T.y, v *= T.x, b *= T.y, m += E, d += z, w = zt(D), D = Jd(w);
    }
  }
  return yi({
    width: v,
    height: b,
    x: m,
    y: d
  });
}
function Vu(n, o) {
  const a = Au(n).scrollLeft;
  return o ? o.left + a : ar(Fl(n)).left + a;
}
function H0(n, o) {
  const a = n.getBoundingClientRect(), i = a.left + o.scrollLeft - Vu(n, a), c = a.top + o.scrollTop;
  return {
    x: i,
    y: c
  };
}
function eC(n) {
  let {
    elements: o,
    rect: a,
    offsetParent: i,
    strategy: c
  } = n;
  const f = c === "fixed", p = Fl(i), g = o ? Mu(o.floating) : !1;
  if (i === p || g && f)
    return a;
  let m = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Pl(1);
  const v = Pl(0), b = Rt(i);
  if ((b || !f) && ((mn(i) !== "body" || sr(p)) && (m = Au(i)), b)) {
    const R = ar(i);
    d = ea(i), v.x = R.x + i.clientLeft, v.y = R.y + i.clientTop;
  }
  const x = p && !b && !f ? H0(p, m) : Pl(0);
  return {
    width: a.width * d.x,
    height: a.height * d.y,
    x: a.x * d.x - m.scrollLeft * d.x + v.x + x.x,
    y: a.y * d.y - m.scrollTop * d.y + v.y + x.y
  };
}
function tC(n) {
  return n.getClientRects ? Array.from(n.getClientRects()) : [];
}
function nC(n) {
  const o = Au(n), a = n.ownerDocument.body, i = Vl(n.scrollWidth, n.clientWidth, a.scrollWidth, a.clientWidth), c = Vl(n.scrollHeight, n.clientHeight, a.scrollHeight, a.clientHeight);
  let f = -o.scrollLeft + Vu(n);
  const p = -o.scrollTop;
  return In(a).direction === "rtl" && (f += Vl(n.clientWidth, a.clientWidth) - i), {
    width: i,
    height: c,
    x: f,
    y: p
  };
}
const lC = 25;
function oC(n, o, a) {
  a === void 0 && (a = "viewport");
  const i = a === "layoutViewport", c = zt(n), f = Fl(n), p = c.visualViewport;
  let g = f.clientWidth, m = f.clientHeight, d = 0, v = 0;
  if (p) {
    const x = !vp() || o === "fixed";
    i ? x || (d = -p.offsetLeft, v = -p.offsetTop) : (g = p.width, m = p.height, x && (d = p.offsetLeft, v = p.offsetTop));
  }
  if (Vu(f) <= 0) {
    const x = f.ownerDocument, R = x.body, w = getComputedStyle(R), D = x.compatMode === "CSS1Compat" && parseFloat(w.marginLeft) + parseFloat(w.marginRight) || 0, T = Math.abs(f.clientWidth - R.clientWidth - D), N = getComputedStyle(f).scrollbarGutter === "stable both-edges" ? T / 2 : T;
    N <= lC && (g -= N);
  }
  return {
    width: g,
    height: m,
    x: d,
    y: v
  };
}
function rC(n, o) {
  const a = ar(n, !0, o === "fixed"), i = a.top + n.clientTop, c = a.left + n.clientLeft, f = ea(n), p = n.clientWidth * f.x, g = n.clientHeight * f.y, m = c * f.x, d = i * f.y;
  return {
    width: p,
    height: g,
    x: m,
    y: d
  };
}
function Fv(n, o, a) {
  let i;
  if (o === "viewport" || o === "layoutViewport")
    i = oC(n, a, o);
  else if (o === "document")
    i = nC(Fl(n));
  else if ($e(o))
    i = rC(o, a);
  else {
    const c = _0(n);
    i = {
      x: o.x - c.x,
      y: o.y - c.y,
      width: o.width,
      height: o.height
    };
  }
  return yi(i);
}
function aC(n, o) {
  const a = o.get(n);
  if (a)
    return a;
  let i = mi(n, [], !1).filter((g) => $e(g) && mn(g) !== "body"), c = null;
  const f = In(n).position === "fixed";
  let p = f ? Yl(n) : n;
  for (; $e(p) && !Bl(p); ) {
    const g = In(p), m = yp(p), d = c ? c.position : f ? "fixed" : "";
    !m && (d === "fixed" || d === "absolute" && g.position === "static") ? i = i.filter((b) => b !== p) : c = g, p = Yl(p);
  }
  return o.set(n, i), i;
}
function iC(n) {
  let {
    element: o,
    boundary: a,
    rootBoundary: i,
    strategy: c
  } = n;
  const p = [...a === "clippingAncestors" ? Mu(o) ? [] : aC(o, this._c) : [].concat(a), i], g = Fv(o, p[0], c);
  let m = g.top, d = g.right, v = g.bottom, b = g.left;
  for (let x = 1; x < p.length; x++) {
    const R = Fv(o, p[x], c);
    m = Vl(R.top, m), d = oa(R.right, d), v = oa(R.bottom, v), b = Vl(R.left, b);
  }
  return {
    width: d - b,
    height: v - m,
    x: b,
    y: m
  };
}
function sC(n) {
  const {
    width: o,
    height: a
  } = k0(n);
  return {
    width: o,
    height: a
  };
}
function uC(n, o, a) {
  const i = Rt(o), c = Fl(o), f = a === "fixed", p = ar(n, !0, f, o);
  let g = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const m = Pl(0);
  if ((i || !f) && ((mn(o) !== "body" || sr(c)) && (g = Au(o)), i)) {
    const x = ar(o, !0, f, o);
    m.x = x.x + o.clientLeft, m.y = x.y + o.clientTop;
  }
  !i && c && (m.x = Vu(c));
  const d = c && !i && !f ? H0(c, g) : Pl(0), v = p.left + g.scrollLeft - m.x - d.x, b = p.top + g.scrollTop - m.y - d.y;
  return {
    x: v,
    y: b,
    width: p.width,
    height: p.height
  };
}
function _d(n) {
  return In(n).position === "static";
}
function Kv(n, o) {
  if (!Rt(n) || In(n).position === "fixed")
    return null;
  if (o)
    return o(n);
  let a = n.offsetParent;
  return Fl(n) === a && (a = a.ownerDocument.body), a;
}
function U0(n, o) {
  const a = zt(n);
  if (Mu(n))
    return a;
  if (!Rt(n)) {
    let c = Yl(n);
    for (; c && !Bl(c); ) {
      if ($e(c) && !_d(c))
        return c;
      c = Yl(c);
    }
    return a;
  }
  let i = Kv(n, o);
  for (; i && yE(i) && _d(i); )
    i = Kv(i, o);
  return i && Bl(i) && _d(i) && !yp(i) ? a : i || xE(n) || a;
}
const cC = async function(n) {
  const o = this.getOffsetParent || U0, a = this.getDimensions, i = await a(n.floating);
  return {
    reference: uC(n.reference, await o(n.floating), n.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function fC(n) {
  return In(n).direction === "rtl";
}
const L0 = {
  convertOffsetParentRelativeRectToViewportRelativeRect: eC,
  getDocumentElement: Fl,
  getClippingRect: iC,
  getOffsetParent: U0,
  getElementRects: cC,
  getClientRects: tC,
  getDimensions: sC,
  getScale: ea,
  isElement: $e,
  isRTL: fC
};
function I0(n, o) {
  return n.x === o.x && n.y === o.y && n.width === o.width && n.height === o.height;
}
function dC(n, o, a) {
  let i = null, c;
  const f = Fl(n);
  function p() {
    var v;
    clearTimeout(c), (v = i) == null || v.disconnect(), i = null;
  }
  function g(v, b) {
    v === void 0 && (v = !1), b === void 0 && (b = 1), p();
    const x = n.getBoundingClientRect(), {
      left: R,
      top: w,
      width: D,
      height: T
    } = x;
    if (v || o(), !D || !T)
      return;
    const N = Xs(w), A = Xs(f.clientWidth - (R + D)), E = Xs(f.clientHeight - (w + T)), z = Xs(R), j = {
      rootMargin: -N + "px " + -A + "px " + -E + "px " + -z + "px",
      threshold: Vl(0, oa(1, b)) || 1
    };
    let O = !0;
    function k(G) {
      const P = G[0].intersectionRatio;
      if (!I0(x, n.getBoundingClientRect()))
        return g();
      if (P !== b) {
        if (!O)
          return g();
        P ? g(!1, P) : c = setTimeout(() => {
          g(!1, 1e-7);
        }, 1e3);
      }
      O = !1;
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
  const m = zt(n), d = () => g(a);
  return m.addEventListener("resize", d), g(!0), () => {
    m.removeEventListener("resize", d), p();
  };
}
function Qv(n, o, a, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: c = !0,
    ancestorResize: f = !0,
    elementResize: p = typeof ResizeObserver == "function",
    layoutShift: g = typeof IntersectionObserver == "function",
    animationFrame: m = !1
  } = i, d = Vp(n), v = c || f ? [...d ? mi(d) : [], ...o ? mi(o) : []] : [];
  v.forEach((N) => {
    c && N.addEventListener("scroll", a), f && N.addEventListener("resize", a);
  });
  const b = d && g ? dC(d, a, f) : null;
  let x = -1, R = null;
  p && (R = new ResizeObserver((N) => {
    let [A] = N;
    A && A.target === d && R && o && (R.unobserve(o), cancelAnimationFrame(x), x = requestAnimationFrame(() => {
      var E;
      (E = R) == null || E.observe(o);
    })), a();
  }), d && !m && R.observe(d), o && R.observe(o));
  let w, D = m ? ar(n) : null;
  m && T();
  function T() {
    const N = ar(n);
    D && !I0(D, N) && a(), D = N, w = requestAnimationFrame(T);
  }
  return a(), () => {
    var N;
    v.forEach((A) => {
      c && A.removeEventListener("scroll", a), f && A.removeEventListener("resize", a);
    }), b?.(), (N = R) == null || N.disconnect(), R = null, m && cancelAnimationFrame(w);
  };
}
const pC = KR, gC = QR, mC = qR, hC = JR, yC = XR, vC = ZR, bC = (n, o, a) => {
  const i = /* @__PURE__ */ new Map(), c = a ?? {}, f = {
    ...L0,
    ...c.platform,
    _c: i
  };
  return GR(n, o, {
    ...c,
    platform: f
  });
};
var xC = typeof document < "u", SC = function() {
}, iu = xC ? y.useLayoutEffect : SC;
function bu(n, o) {
  if (n === o)
    return !0;
  if (typeof n != typeof o)
    return !1;
  if (typeof n == "function" && n.toString() === o.toString())
    return !0;
  let a, i, c;
  if (n && o && typeof n == "object") {
    if (Array.isArray(n)) {
      if (a = n.length, a !== o.length) return !1;
      for (i = a; i-- !== 0; )
        if (!bu(n[i], o[i]))
          return !1;
      return !0;
    }
    if (c = Object.keys(n), a = c.length, a !== Object.keys(o).length)
      return !1;
    for (i = a; i-- !== 0; )
      if (!{}.hasOwnProperty.call(o, c[i]))
        return !1;
    for (i = a; i-- !== 0; ) {
      const f = c[i];
      if (!(f === "_owner" && n.$$typeof) && !bu(n[f], o[f]))
        return !1;
    }
    return !0;
  }
  return n !== n && o !== o;
}
function B0(n) {
  return typeof window > "u" ? 1 : (n.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function Zv(n, o) {
  const a = B0(n);
  return Math.round(o * a) / a;
}
function Hd(n) {
  const o = y.useRef(n);
  return iu(() => {
    o.current = n;
  }), o;
}
function wC(n) {
  n === void 0 && (n = {});
  const {
    placement: o = "bottom",
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
  } = n, [v, b] = y.useState({
    x: 0,
    y: 0,
    strategy: a,
    placement: o,
    middlewareData: {},
    isPositioned: !1
  }), [x, R] = y.useState(i);
  bu(x, i) || R(i);
  const [w, D] = y.useState(null), [T, N] = y.useState(null), A = y.useCallback((B) => {
    B !== j.current && (j.current = B, D(B));
  }, []), E = y.useCallback((B) => {
    B !== O.current && (O.current = B, N(B));
  }, []), z = f || w, U = p || T, j = y.useRef(null), O = y.useRef(null), k = y.useRef(v), G = m != null, P = Hd(m), ne = Hd(c), K = Hd(d), Q = y.useCallback(() => {
    if (!j.current || !O.current)
      return;
    const B = {
      placement: o,
      strategy: a,
      middleware: x
    };
    ne.current && (B.platform = ne.current), bC(j.current, O.current, B).then((F) => {
      const I = {
        ...F,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: K.current !== !1
      };
      Z.current && !bu(k.current, I) && (k.current = I, gl.flushSync(() => {
        b(I);
      }));
    });
  }, [x, o, a, ne, K]);
  iu(() => {
    d === !1 && k.current.isPositioned && (k.current.isPositioned = !1, b((B) => ({
      ...B,
      isPositioned: !1
    })));
  }, [d]);
  const Z = y.useRef(!1);
  iu(() => (Z.current = !0, () => {
    Z.current = !1;
  }), []), iu(() => {
    if (z && (j.current = z), U && (O.current = U), z && U) {
      if (P.current)
        return P.current(z, U, Q);
      Q();
    }
  }, [z, U, Q, P, G]);
  const q = y.useMemo(() => ({
    reference: j,
    floating: O,
    setReference: A,
    setFloating: E
  }), [A, E]), _ = y.useMemo(() => ({
    reference: z,
    floating: U
  }), [z, U]), Y = y.useMemo(() => {
    const B = {
      position: a,
      left: 0,
      top: 0
    };
    if (!_.floating)
      return B;
    const F = Zv(_.floating, v.x), I = Zv(_.floating, v.y);
    return g ? {
      ...B,
      transform: "translate(" + F + "px, " + I + "px)",
      ...B0(_.floating) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: a,
      left: F,
      top: I
    };
  }, [a, g, _.floating, v.x, v.y]);
  return y.useMemo(() => ({
    ...v,
    update: Q,
    refs: q,
    elements: _,
    floatingStyles: Y
  }), [v, Q, q, _, Y]);
}
const EC = (n, o) => {
  const a = pC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, TC = (n, o) => {
  const a = gC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, RC = (n, o) => ({
  fn: vC(n).fn,
  options: [n, o]
}), CC = (n, o) => {
  const a = mC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, OC = (n, o) => {
  const a = hC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, MC = (n, o) => {
  const a = yC(n);
  return {
    name: a.name,
    fn: a.fn,
    options: [n, o]
  };
}, me = (n, o, a, i, c, f, ...p) => {
  if (p.length > 0)
    throw new Error(Mt(1));
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
var Ud = { exports: {} }, Ld = {};
var Jv;
function AC() {
  if (Jv) return Ld;
  Jv = 1;
  var n = xi();
  function o(b, x) {
    return b === x && (b !== 0 || 1 / b === 1 / x) || b !== b && x !== x;
  }
  var a = typeof Object.is == "function" ? Object.is : o, i = n.useState, c = n.useEffect, f = n.useLayoutEffect, p = n.useDebugValue;
  function g(b, x) {
    var R = x(), w = i({ inst: { value: R, getSnapshot: x } }), D = w[0].inst, T = w[1];
    return f(
      function() {
        D.value = R, D.getSnapshot = x, m(D) && T({ inst: D });
      },
      [b, R, x]
    ), c(
      function() {
        return m(D) && T({ inst: D }), b(function() {
          m(D) && T({ inst: D });
        });
      },
      [b]
    ), p(R), R;
  }
  function m(b) {
    var x = b.getSnapshot;
    b = b.value;
    try {
      var R = x();
      return !a(b, R);
    } catch {
      return !0;
    }
  }
  function d(b, x) {
    return x();
  }
  var v = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? d : g;
  return Ld.useSyncExternalStore = n.useSyncExternalStore !== void 0 ? n.useSyncExternalStore : v, Ld;
}
var $v;
function V0() {
  return $v || ($v = 1, Ud.exports = AC()), Ud.exports;
}
var P0 = V0(), Id = { exports: {} }, Bd = {};
var Wv;
function zC() {
  if (Wv) return Bd;
  Wv = 1;
  var n = xi(), o = V0();
  function a(d, v) {
    return d === v && (d !== 0 || 1 / d === 1 / v) || d !== d && v !== v;
  }
  var i = typeof Object.is == "function" ? Object.is : a, c = o.useSyncExternalStore, f = n.useRef, p = n.useEffect, g = n.useMemo, m = n.useDebugValue;
  return Bd.useSyncExternalStoreWithSelector = function(d, v, b, x, R) {
    var w = f(null);
    if (w.current === null) {
      var D = { hasValue: !1, value: null };
      w.current = D;
    } else D = w.current;
    w = g(
      function() {
        function N(j) {
          if (!A) {
            if (A = !0, E = j, j = x(j), R !== void 0 && D.hasValue) {
              var O = D.value;
              if (R(O, j))
                return z = O;
            }
            return z = j;
          }
          if (O = z, i(E, j)) return O;
          var k = x(j);
          return R !== void 0 && R(O, k) ? (E = j, O) : (E = j, z = k);
        }
        var A = !1, E, z, U = b === void 0 ? null : b;
        return [
          function() {
            return N(v());
          },
          U === null ? void 0 : function() {
            return N(U());
          }
        ];
      },
      [v, b, x, R]
    );
    var T = c(d, w[0], w[1]);
    return p(
      function() {
        D.hasValue = !0, D.value = T;
      },
      [T]
    ), m(T), T;
  }, Bd;
}
var eb;
function DC() {
  return eb || (eb = 1, Id.exports = zC()), Id.exports;
}
var NC = DC();
const sp = [];
let up;
function jC() {
  return up;
}
function kC(n) {
  sp.push(n);
}
function Pp(n) {
  const o = (a, i) => {
    const c = xn(_C).current;
    let f;
    try {
      up = c;
      for (const p of sp)
        p.before(c);
      f = n(a, i);
      for (const p of sp)
        p.after(c);
      c.didInitialize = !0;
    } finally {
      up = void 0;
    }
    return f;
  };
  return o.displayName = n.displayName || n.name, o;
}
function Y0(n) {
  return /* @__PURE__ */ y.forwardRef(Pp(n));
}
function _C() {
  return {
    didInitialize: !1
  };
}
const HC = Ep(19), UC = HC ? IC : BC;
function Pe(n, o, a, i, c) {
  return UC(n, o, a, i, c);
}
function LC(n, o, a, i, c) {
  const f = y.useCallback(() => o(n.getSnapshot(), a, i, c), [n, o, a, i, c]);
  return P0.useSyncExternalStore(n.subscribe, f, f);
}
kC({
  before(n) {
    n.syncIndex = 0, n.didInitialize || (n.syncTick = 1, n.syncHooks = [], n.didChangeStore = !0, n.getSnapshot = () => {
      let o = !1;
      for (let a = 0; a < n.syncHooks.length; a += 1) {
        const i = n.syncHooks[a], c = i.selector(i.store.state, i.a1, i.a2, i.a3);
        Object.is(i.value, c) || (o = !0, i.value = c);
      }
      return o && (n.syncTick += 1), n.syncTick;
    });
  },
  after(n) {
    n.syncHooks.length > 0 && (n.didChangeStore && (n.didChangeStore = !1, n.subscribe = (o) => {
      const a = /* @__PURE__ */ new Set();
      for (const c of n.syncHooks)
        a.add(c.store);
      const i = [];
      for (const c of a)
        i.push(c.subscribe(o));
      return () => {
        for (const c of i)
          c();
      };
    }), P0.useSyncExternalStore(n.subscribe, n.getSnapshot, n.getSnapshot));
  }
});
function IC(n, o, a, i, c) {
  const f = jC();
  if (!f)
    return LC(n, o, a, i, c);
  const p = f.syncIndex;
  f.syncIndex += 1;
  let g;
  return f.didInitialize ? (g = f.syncHooks[p], (g.store !== n || g.selector !== o || !Object.is(g.a1, a) || !Object.is(g.a2, i) || !Object.is(g.a3, c)) && (g.store !== n && (f.didChangeStore = !0), g.store = n, g.selector = o, g.a1 = a, g.a2 = i, g.a3 = c, g.value = o(n.getSnapshot(), a, i, c))) : (g = {
    store: n,
    selector: o,
    a1: a,
    a2: i,
    a3: c,
    value: o(n.getSnapshot(), a, i, c)
  }, f.syncHooks.push(g)), g.value;
}
function BC(n, o, a, i, c) {
  return NC.useSyncExternalStoreWithSelector(n.subscribe, n.getSnapshot, n.getSnapshot, (f) => o(f, a, i, c));
}
class G0 {
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
  use(o, a, i, c) {
    return Pe(this, o, a, i, c);
  }
}
class Ti extends G0 {
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
    const i = this, c = a !== void 0;
    xe(() => {
      c && !Object.is(i.state[o], a) && i.setState({
        ...i.state,
        [o]: a
      });
    }, [i, o, a, c]);
  }
  /** Gets the current value from the store using a selector with the provided key.
   *
   * @param key Key of the selector to use.
   */
  select(o, a, i, c) {
    const f = this.selectors[o];
    return f(this.state, a, i, c);
  }
  /**
   * Returns a value from the store's state using a selector function.
   * Used to subscribe to specific parts of the state.
   * This methods causes a rerender whenever the selected state changes.
   *
   * @param key Key of the selector to use.
   */
  useState(o, a, i, c) {
    return y.useDebugValue(o), Pe(this, this.selectors[o], a, i, c);
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
const VC = {
  open: me((n) => n.open),
  transitionStatus: me((n) => n.transitionStatus),
  domReferenceElement: me((n) => n.domReferenceElement),
  referenceElement: me((n) => n.positionReference ?? n.referenceElement),
  floatingElement: me((n) => n.floatingElement),
  floatingId: me((n) => n.floatingId)
};
class Pu extends Ti {
  constructor(o) {
    const {
      syncOnly: a,
      nested: i,
      onOpenChange: c,
      triggerElements: f,
      ...p
    } = o;
    super({
      ...p,
      positionReference: p.referenceElement,
      domReferenceElement: p.referenceElement
    }, {
      onOpenChange: c,
      dataRef: {
        current: {}
      },
      events: M0(),
      nested: i,
      triggerElements: f
    }, VC), this.syncOnly = a;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (o, a) => {
    (!o || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    a != null && $T(a)) && (this.context.dataRef.current.openEvent = o ? a : void 0);
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
function q0(n) {
  const {
    popupStore: o,
    treatPopupAsFloatingElement: a = !1,
    floatingRootContext: i,
    floatingId: c,
    nested: f,
    onOpenChange: p
  } = n, g = o.useState("open"), m = o.useState("activeTriggerElement"), d = o.useState(a ? "popupElement" : "positionerElement"), v = o.context.triggerElements, b = p, x = y.useRef(null);
  i === void 0 && x.current === null && (x.current = new Pu({
    open: g,
    transitionStatus: void 0,
    referenceElement: m,
    floatingElement: d,
    triggerElements: v,
    onOpenChange: b,
    floatingId: c,
    syncOnly: !0,
    nested: f
  }));
  const R = i ?? x.current;
  return o.useSyncedValue("floatingId", c), xe(() => {
    const w = {
      open: g,
      floatingId: c,
      referenceElement: m,
      floatingElement: d
    };
    $e(m) && (w.domReferenceElement = m), R.state.positionReference === R.state.referenceElement && (w.positionReference = m), R.update(w);
  }, [g, c, m, d, R]), R.context.onOpenChange = b, R.context.nested = f, R;
}
function Yu(n, o = !1, a = !1) {
  const [i, c] = y.useState(n && o ? "idle" : void 0), [f, p] = y.useState(n);
  return n && !f && (p(!0), c("starting")), !n && f && i !== "ending" && !a && c("ending"), !n && !f && i === "ending" && c(void 0), xe(() => {
    if (!n && f && i !== "ending" && a) {
      const g = dl.request(() => {
        c("ending");
      });
      return () => {
        dl.cancel(g);
      };
    }
  }, [n, f, i, a]), xe(() => {
    if (!n || o)
      return;
    const g = dl.request(() => {
      c(void 0);
    });
    return () => {
      dl.cancel(g);
    };
  }, [o, n]), xe(() => {
    if (!n || !o)
      return;
    n && f && i !== "idle" && c("starting");
    const g = dl.request(() => {
      c("idle");
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
const PC = {
  [bi.startingStyle]: ""
}, YC = {
  [bi.endingStyle]: ""
}, jo = {
  transitionStatus(n) {
    return n === "starting" ? PC : n === "ending" ? YC : null;
  }
};
function Yp(n, o = !1, a = !0) {
  const i = na();
  return ze((c, f = null) => {
    i.cancel();
    const p = Ul(n);
    if (p == null)
      return;
    const g = p, m = () => {
      gl.flushSync(c);
    };
    if (typeof g.getAnimations != "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      c();
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
    onComplete: c
  } = n, f = ze(c), p = Yp(i, a, !1);
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
  [tp]: ""
};
function X0(n) {
  return (o) => o === "touch" ? n.current : !0;
}
function Gp(n, o, a = !1) {
  const i = rr(), c = Kl() != null, f = y.useRef(null);
  n === void 0 && f.current === null && (f.current = o(i, c));
  const p = n ?? f.current;
  return q0({
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
function F0(n, o) {
  const a = y.useRef(null), i = y.useRef(null);
  return y.useCallback((c) => {
    if (n === void 0)
      return;
    let f = !1;
    if (a.current !== null) {
      const p = a.current, g = i.current, m = o.context.triggerElements.getById(p);
      g && m === g && (o.context.triggerElements.delete(p), f = !0), a.current = null, i.current = null;
    }
    if (c !== null && (a.current = n, i.current = c, o.context.triggerElements.add(n, c), f = !0), f) {
      const p = o.context.triggerElements.size;
      o.select("open") && o.state.triggerCount !== p && o.set("triggerCount", p);
    }
  }, [o, n]);
}
function Gu(n, o, a, i = !1) {
  o ? n.preventUnmountingOnClose = !1 : i && (n.preventUnmountingOnClose = !0);
  const c = a?.id ?? null;
  (c || o) && (n.activeTriggerId = c, n.activeTriggerElement = a ?? null);
}
function qp(n) {
  let o = !1;
  return n.preventUnmountOnClose = () => {
    o = !0;
  }, () => o;
}
function GC(n, o, a, i = {}) {
  const c = a.reason, f = c === Pt, p = o && c === Jr, g = !o && (c === ql || c === Si), m = qp(a);
  if (n.context.onOpenChange?.(o, a), a.isCanceled)
    return;
  i.onBeforeDispatch?.(), n.state.floatingRootContext.dispatchOpenChange(o, a);
  const d = () => {
    const v = {
      ...i.extraState,
      open: o
    };
    p ? v.instantType = "focus" : g ? v.instantType = "dismiss" : f && (v.instantType = void 0), Gu(v, o, a.trigger, m()), n.update(v);
  };
  f ? gl.flushSync(d) : d();
}
function Xp(n, o, a, i) {
  Cp(() => {
    o === void 0 && n.state.open === !1 && a && (n.state = {
      ...n.state,
      open: !0,
      activeTriggerId: i,
      preventUnmountingOnClose: !1
    });
  });
}
function Fp(n, o, a, i) {
  const c = a.useState("isMountedByTrigger", n), f = F0(n, a), p = ze((g) => {
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
      activeTriggerElement: o.current,
      ...i
    });
  }, [c, a, o, ...Object.values(i)]), {
    registerTrigger: p,
    isMountedByThisTrigger: c
  };
}
function qu(n, o = {}) {
  const {
    closeOnActiveTriggerUnmount: a = !1
  } = o, i = n.useState("open"), c = n.useState("triggerCount");
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
  }, [i, n, c, a]);
}
function Xu(n, o, a) {
  const {
    mounted: i,
    setMounted: c,
    transitionStatus: f
  } = Yu(n), p = o.useState("preventUnmountingOnClose"), g = n ? !1 : p;
  o.useSyncedValues({
    mounted: i,
    transitionStatus: f,
    preventUnmountingOnClose: g
  });
  const m = ze(() => {
    c(!1), o.update({
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
function Fu(n, o) {
  n.useSyncedValues(o), xe(() => () => {
    n.update({
      activeTriggerProps: bt,
      inactiveTriggerProps: bt,
      popupProps: bt
    });
  }, [n]);
}
function K0(n, o) {
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
function qC() {
  return new Pu({
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
function Ku() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: void 0,
    floatingRootContext: qC(),
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
function Kp(n, o, a = !1) {
  return new Pu({
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
const ci = me((n) => n.triggerIdProp ?? n.activeTriggerId), Qp = me((n) => n.openProp ?? n.open), tb = me((n) => (n.popupElement?.id ?? n.floatingId) || void 0);
function Q0(n, o) {
  return o !== void 0 && Qp(n) && ci(n) === o;
}
function XC(n, o) {
  return Q0(n, o) ? !0 : o !== void 0 && Qp(n) && ci(n) == null && n.triggerCount === 1;
}
const Qu = {
  open: Qp,
  mounted: me((n) => n.mounted),
  transitionStatus: me((n) => n.transitionStatus),
  floatingRootContext: me((n) => n.floatingRootContext),
  triggerCount: me((n) => n.triggerCount),
  preventUnmountingOnClose: me((n) => n.preventUnmountingOnClose),
  payload: me((n) => n.payload),
  activeTriggerId: ci,
  activeTriggerElement: me((n) => n.mounted ? n.activeTriggerElement : null),
  popupId: tb,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: me((n, o) => o !== void 0 && ci(n) === o),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: me((n, o) => Q0(n, o)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: me((n, o) => o !== void 0 && ci(n) === o && n.mounted),
  triggerProps: me((n, o) => o ? n.activeTriggerProps : n.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: me((n, o) => XC(n, o) ? tb(n) : void 0),
  popupProps: me((n) => n.popupProps),
  popupElement: me((n) => n.popupElement),
  positionerElement: me((n) => n.positionerElement)
};
function Z0(n) {
  const {
    open: o = !1,
    onOpenChange: a,
    elements: i = {}
  } = n, c = rr(), f = Kl() != null, p = xn(() => new Pu({
    open: o,
    transitionStatus: void 0,
    onOpenChange: a,
    referenceElement: i.reference ?? null,
    floatingElement: i.floating ?? null,
    triggerElements: new sa(),
    floatingId: c,
    syncOnly: !1,
    nested: f
  })).current;
  return xe(() => {
    const g = {
      open: o,
      floatingId: c
    };
    i.reference !== void 0 && (g.referenceElement = i.reference, g.domReferenceElement = $e(i.reference) ? i.reference : null), i.floating !== void 0 && (g.floatingElement = i.floating), p.update(g);
  }, [o, c, i.reference, i.floating, p]), p.context.onOpenChange = a, p.context.nested = f, p;
}
function FC(n = {}) {
  const {
    nodeId: o,
    externalTree: a
  } = n, i = Z0(n), c = n.rootContext || i, f = c.useState("referenceElement"), p = c.useState("floatingElement"), g = c.useState("domReferenceElement"), m = c.useState("open"), d = c.useState("floatingId"), [v, b] = y.useState(null), [x, R] = y.useState(void 0), [w, D] = y.useState(void 0), T = y.useRef(null), N = No(a), A = y.useMemo(() => ({
    reference: f,
    floating: p,
    domReference: g
  }), [f, p, g]), E = wC({
    ...n,
    elements: {
      ...A,
      ...v && {
        reference: v
      }
    }
  }), z = $e(x) ? x : null, U = w === void 0 ? c.state.floatingElement : w;
  c.useSyncedValue("referenceElement", x ?? null), c.useSyncedValue("domReferenceElement", x === void 0 ? g : z), c.useSyncedValue("floatingElement", U);
  const j = y.useCallback((K) => {
    const Q = $e(K) ? {
      getBoundingClientRect: () => K.getBoundingClientRect(),
      getClientRects: () => K.getClientRects(),
      contextElement: K
    } : K;
    b(Q), E.refs.setReference(Q);
  }, [E.refs]), O = y.useCallback((K) => {
    ($e(K) || K === null) && (T.current = K, R(K)), ($e(E.refs.reference.current) || E.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    K !== null && !$e(K)) && E.refs.setReference(K);
  }, [E.refs, R]), k = y.useCallback((K) => {
    D(K), E.refs.setFloating(K);
  }, [E.refs]), G = y.useMemo(() => ({
    ...E.refs,
    setReference: O,
    setFloating: k,
    setPositionReference: j,
    domReference: T
  }), [E.refs, O, k, j]), P = y.useMemo(() => ({
    ...E.elements,
    domReference: g
  }), [E.elements, g]), ne = y.useMemo(() => ({
    ...E,
    dataRef: c.context.dataRef,
    open: m,
    onOpenChange: c.setOpen,
    events: c.context.events,
    floatingId: d,
    refs: G,
    elements: P,
    nodeId: o,
    rootStore: c
  }), [E, G, P, o, c, m, d]);
  return xe(() => {
    g && (T.current = g);
  }, [g]), xe(() => {
    c.context.dataRef.current.floatingContext = ne;
    const K = N?.nodesRef.current.find((Q) => Q.id === o);
    K && (K.context = ne);
  }), y.useMemo(() => ({
    ...E,
    context: ne,
    refs: G,
    elements: P,
    rootStore: c
  }), [E, G, P, ne, c]);
}
const Vd = Op && Ao;
function J0(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i
  } = o, c = "rootStore" in n ? n.rootStore : n, {
    events: f,
    dataRef: p
  } = c.context, g = y.useRef(!1), m = y.useRef(null), d = y.useRef(!0), v = an();
  y.useEffect(() => {
    const x = c.select("domReferenceElement");
    if (!a)
      return;
    const R = zt(x);
    function w() {
      const N = c.select("domReferenceElement");
      !c.select("open") && Rt(N) && N === vn(tt(N)) && (g.current = !0);
    }
    function D() {
      d.current = !0;
    }
    function T() {
      d.current = !1;
    }
    return pl(Je(R, "blur", w), Vd && Je(R, "keydown", D, !0), Vd && Je(R, "pointerdown", T, !0));
  }, [c, a]), y.useEffect(() => {
    if (!a)
      return;
    function x(R) {
      if (R.reason === ql || R.reason === Si) {
        const w = c.select("domReferenceElement");
        $e(w) && (m.current = w, g.current = !0);
      }
    }
    return f.on("openchange", x), () => {
      f.off("openchange", x);
    };
  }, [f, a, c]);
  const b = y.useMemo(() => {
    function x() {
      g.current = !1, m.current = null;
    }
    return {
      onMouseLeave() {
        x();
      },
      onFocus(R) {
        const w = R.currentTarget;
        if (g.current) {
          if (m.current === w)
            return;
          x();
        }
        const D = gn(R.nativeEvent);
        if ($e(D)) {
          if (Vd && !R.relatedTarget) {
            if (!d.current && !ku(D))
              return;
          } else if (!tR(D))
            return;
        }
        const T = gu(R.relatedTarget, c.context.triggerElements), {
          nativeEvent: N,
          currentTarget: A
        } = R, E = typeof i == "function" ? i() : i;
        if (c.select("open") && T || E === 0 || E === void 0) {
          c.setOpen(!0, Ye(Jr, N, A));
          return;
        }
        v.start(E, () => {
          g.current || c.setOpen(!0, Ye(Jr, N, A));
        });
      },
      onBlur(R) {
        x();
        const w = R.relatedTarget, D = R.nativeEvent, T = $e(w) && w.hasAttribute(vi("focus-guard")) && w.getAttribute("data-type") === "outside";
        v.start(0, () => {
          const N = c.select("domReferenceElement"), A = vn(tt(N));
          !w && A === N || Le(p.current.floatingContext?.refs.floating.current, A) || Le(N, A) || T || gu(w ?? A, c.context.triggerElements) || c.setOpen(!1, Ye(Jr, D));
        });
      }
    };
  }, [p, i, c, v]);
  return y.useMemo(() => a ? {
    reference: b,
    trigger: b
  } : {}, [a, b]);
}
class Zp {
  constructor() {
    this.pointerType = void 0, this.interactedInside = !1, this.handler = void 0, this.blockMouseMove = !0, this.performedPointerEventsMutation = !1, this.pointerEventsScopeElement = null, this.pointerEventsReferenceElement = null, this.pointerEventsFloatingElement = null, this.restTimeoutPending = !1, this.openChangeTimeout = new el(), this.restTimeout = new el(), this.handleCloseOptions = void 0;
  }
  static create() {
    return new Zp();
  }
  dispose = () => {
    this.openChangeTimeout.clear(), this.restTimeout.clear();
  };
  disposeEffect = () => this.dispose;
}
const xu = /* @__PURE__ */ new WeakMap();
function Su(n) {
  if (!n.performedPointerEventsMutation)
    return;
  const o = n.pointerEventsScopeElement;
  o && xu.get(o) === n && (n.pointerEventsScopeElement?.style.removeProperty("pointer-events"), n.pointerEventsReferenceElement?.style.removeProperty("pointer-events"), n.pointerEventsFloatingElement?.style.removeProperty("pointer-events"), xu.delete(o)), n.performedPointerEventsMutation = !1, n.pointerEventsScopeElement = null, n.pointerEventsReferenceElement = null, n.pointerEventsFloatingElement = null;
}
function $0(n, o) {
  const {
    scopeElement: a,
    referenceElement: i,
    floatingElement: c
  } = o, f = xu.get(a);
  f && f !== n && Su(f), Su(n), n.performedPointerEventsMutation = !0, n.pointerEventsScopeElement = a, n.pointerEventsReferenceElement = i, n.pointerEventsFloatingElement = c, xu.set(a, n), a.style.pointerEvents = "none", i.style.pointerEvents = "auto", c.style.pointerEvents = "auto";
}
function Jp(n) {
  const o = n.context.dataRef.current, a = xn(() => o.hoverInteractionState ?? Zp.create()).current;
  return o.hoverInteractionState || (o.hoverInteractionState = a), Ap(o.hoverInteractionState.disposeEffect), o.hoverInteractionState;
}
function $p(n, o = {}) {
  const {
    enabled: a = !0,
    closeDelay: i = 0,
    nodeId: c
  } = o, f = "rootStore" in n ? n.rootStore : n, p = f.useState("open"), g = f.useState("floatingElement"), m = f.useState("domReferenceElement"), {
    dataRef: d
  } = f.context, v = No(), b = Kl(), x = Jp(f), R = an(), w = ze(() => l0(d.current.openEvent?.type, x.interactedInside)), D = ze(() => lR(d.current.openEvent?.type)), T = ze(() => {
    Su(x);
  });
  xe(() => {
    p || (x.pointerType = void 0, x.restTimeoutPending = !1, x.interactedInside = !1, T());
  }, [p, x, T]), y.useEffect(() => T, [T]), xe(() => {
    if (a && p && x.handleCloseOptions?.blockPointerEvents && D() && $e(m) && g) {
      const N = m, A = g, E = tt(g), z = v?.nodesRef.current.find((k) => k.id === b)?.context?.elements.floating;
      z && (z.style.pointerEvents = "");
      const U = x.pointerEventsScopeElement !== A ? x.pointerEventsScopeElement : null, j = z !== A ? z : null, O = x.handleCloseOptions?.getScope?.() ?? U ?? j ?? N.closest("[data-rootownerid]") ?? E.body;
      return $0(x, {
        scopeElement: O,
        referenceElement: N,
        floatingElement: A
      }), () => {
        T();
      };
    }
  }, [a, p, m, g, x, D, v, b, T]), y.useEffect(() => {
    if (!a)
      return;
    function N() {
      return !!(v && b && Co(v.nodesRef.current, b).length > 0);
    }
    function A(k) {
      const G = la(i, "close", x.pointerType), P = () => {
        f.setOpen(!1, Ye(Pt, k)), v?.events.emit("floating.closed", k);
      };
      G ? x.openChangeTimeout.start(G, P) : (x.openChangeTimeout.clear(), P());
    }
    function E(k) {
      const G = gn(k);
      if (!eR(G)) {
        x.interactedInside = !1;
        return;
      }
      x.interactedInside = G?.closest("[aria-haspopup]") != null;
    }
    function z() {
      x.openChangeTimeout.clear(), R.clear(), v?.events.off("floating.closed", j), T();
    }
    function U(k) {
      if (N() && v) {
        v.events.on("floating.closed", j);
        return;
      }
      if (gu(k.relatedTarget, f.context.triggerElements))
        return;
      const G = d.current.floatingContext?.nodeId ?? c, P = k.relatedTarget;
      if (!(v && G && $e(P) && Co(v.nodesRef.current, G, !1).some((K) => Le(K.context?.elements.floating, P)))) {
        if (x.handler) {
          x.handler(k);
          return;
        }
        T(), D() && !w() && A(k);
      }
    }
    function j(k) {
      !v || !b || N() || R.start(0, () => {
        v.events.off("floating.closed", j), f.setOpen(!1, Ye(Pt, k)), v.events.emit("floating.closed", k);
      });
    }
    const O = g;
    return pl(O && Je(O, "mouseenter", z), O && Je(O, "mouseleave", U), O && Je(O, "pointerdown", E, !0), () => {
      v?.events.off("floating.closed", j);
    });
  }, [a, g, f, d, i, c, D, w, T, x, v, b, R]);
}
const KC = {
  current: null
};
function Zu(n, o = {}) {
  const {
    enabled: a = !0,
    delay: i = 0,
    handleClose: c = null,
    mouseOnly: f = !1,
    restMs: p = 0,
    move: g = !0,
    triggerElementRef: m = KC,
    externalTree: d,
    isActiveTrigger: v = !0,
    getHandleCloseContext: b,
    isClosing: x,
    shouldOpen: R
  } = o, w = "rootStore" in n ? n.rootStore : n, {
    dataRef: D,
    events: T
  } = w.context, N = No(d), A = Jp(w), E = y.useRef(!1), z = Yt(c), U = Yt(i), j = Yt(p), O = Yt(a), k = Yt(R), G = Yt(x), P = ze(() => l0(D.current.openEvent?.type, A.interactedInside)), ne = ze(() => k.current?.() !== !1), K = ze((q, _, Y) => {
    const B = w.context.triggerElements;
    if (B.hasElement(_))
      return !q || !Le(q, _);
    if (!$e(Y))
      return !1;
    const F = Y;
    return B.hasMatchingElement((I) => Le(I, F)) && (!q || !Le(q, F));
  }), Q = ze(() => {
    if (!A.handler)
      return;
    tt(w.select("domReferenceElement")).removeEventListener("mousemove", A.handler), A.handler = void 0;
  }), Z = ze(() => {
    Su(A);
  });
  return v && (A.handleCloseOptions = z.current?.__options), y.useEffect(() => Q, [Q]), y.useEffect(() => {
    if (!a)
      return;
    function q(_) {
      _.open ? E.current = !1 : (E.current = _.reason === Pt, Q(), A.openChangeTimeout.clear(), A.restTimeout.clear(), A.blockMouseMove = !0, A.restTimeoutPending = !1);
    }
    return T.on("openchange", q), () => {
      T.off("openchange", q);
    };
  }, [a, T, A, Q]), y.useEffect(() => {
    if (!a)
      return;
    function q(F, I = !0) {
      const M = la(U.current, "close", A.pointerType);
      M ? A.openChangeTimeout.start(M, () => {
        w.setOpen(!1, Ye(Pt, F)), N?.events.emit("floating.closed", F);
      }) : I && (A.openChangeTimeout.clear(), w.setOpen(!1, Ye(Pt, F)), N?.events.emit("floating.closed", F));
    }
    const _ = m.current ?? (v ? w.select("domReferenceElement") : null);
    if (!$e(_))
      return;
    function Y(F) {
      if (A.openChangeTimeout.clear(), A.blockMouseMove = !1, f && !or(A.pointerType))
        return;
      const I = Ov(j.current), M = la(U.current, "open", A.pointerType), H = gn(F), te = F.currentTarget ?? null, J = w.select("domReferenceElement");
      let re = te;
      if ($e(H) && !w.context.triggerElements.hasElement(H)) {
        for (const Re of w.context.triggerElements.elements())
          if (Le(Re, H)) {
            re = Re;
            break;
          }
      }
      $e(te) && $e(J) && !w.context.triggerElements.hasElement(te) && Le(te, J) && (re = J);
      const ie = re == null ? !1 : K(J, re, H), oe = w.select("open"), se = G.current?.() ?? w.select("transitionStatus") === "ending", ge = !oe && se && E.current, je = !ie && $e(re) && $e(J) && Le(J, re) && ge, Ee = I > 0 && !M, fe = ie && (oe || ge) || je, ye = !oe || ie;
      if (fe) {
        ne() && w.setOpen(!0, Ye(Pt, F, re));
        return;
      }
      Ee || (M ? A.openChangeTimeout.start(M, () => {
        ye && ne() && w.setOpen(!0, Ye(Pt, F, re));
      }) : ye && ne() && w.setOpen(!0, Ye(Pt, F, re)));
    }
    function B(F) {
      if (P()) {
        Z();
        return;
      }
      Q();
      const I = w.select("domReferenceElement"), M = tt(I);
      A.restTimeout.clear(), A.restTimeoutPending = !1;
      const H = D.current.floatingContext ?? b?.();
      if (gu(F.relatedTarget, w.context.triggerElements))
        return;
      if (z.current && H) {
        w.select("open") || A.openChangeTimeout.clear();
        const J = m.current;
        A.handler = z.current({
          ...H,
          tree: N,
          x: F.clientX,
          y: F.clientY,
          onClose() {
            Z(), Q(), O.current && !P() && J === w.select("domReferenceElement") && q(F, !0);
          }
        }), M.addEventListener("mousemove", A.handler), A.handler(F);
        return;
      }
      (A.pointerType !== "touch" || !Le(w.select("floatingElement"), F.relatedTarget)) && q(F);
    }
    return g ? pl(Je(_, "mousemove", Y, {
      once: !0
    }), Je(_, "mouseenter", Y), Je(_, "mouseleave", B)) : pl(Je(_, "mouseenter", Y), Je(_, "mouseleave", B));
  }, [Q, Z, D, U, w, a, z, A, v, K, P, f, g, j, m, N, O, b, G, ne]), y.useMemo(() => {
    if (!a)
      return;
    function q(_) {
      A.pointerType = _.pointerType;
    }
    return {
      onPointerDown: q,
      onPointerEnter: q,
      onMouseMove(_) {
        const {
          nativeEvent: Y
        } = _, B = _.currentTarget, F = w.select("domReferenceElement"), I = w.select("open"), M = K(F, B, _.target);
        if (f && !or(A.pointerType))
          return;
        if (I && M && A.handleCloseOptions?.blockPointerEvents) {
          const J = w.select("floatingElement");
          if (J) {
            const re = A.handleCloseOptions?.getScope?.() ?? B.ownerDocument.body;
            $0(A, {
              scopeElement: re,
              referenceElement: B,
              floatingElement: J
            });
          }
        }
        const H = Ov(j.current);
        if (I && !M || H === 0 || !M && A.restTimeoutPending && _.movementX ** 2 + _.movementY ** 2 < 2)
          return;
        A.restTimeout.clear();
        function te() {
          if (A.restTimeoutPending = !1, P())
            return;
          const J = w.select("open");
          !A.blockMouseMove && (!J || M) && ne() && w.setOpen(!0, Ye(Pt, Y, B));
        }
        A.pointerType === "touch" ? gl.flushSync(() => {
          te();
        }) : M && I ? te() : (A.restTimeoutPending = !0, A.restTimeout.start(H, te));
      }
    };
  }, [a, A, P, K, f, w, j, ne]);
}
const QC = "Escape";
function Ju(n, o, a) {
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
  return Ju(o, n === n0 || n === Dp, n === Nu || n === ju);
}
function Pd(n, o, a) {
  return Ju(o, n === Dp, a ? n === Nu : n === ju) || n === "Enter" || n === " " || n === "";
}
function ZC(n, o, a) {
  return Ju(o, a ? n === Nu : n === ju, n === Dp);
}
function JC(n, o, a, i) {
  const c = a ? n === ju : n === Nu, f = n === n0;
  return o === "both" || o === "horizontal" && i ? n === QC : Ju(o, c, f);
}
function W0(n, o) {
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
    rtl: v = !1,
    virtual: b = !1,
    focusItemOnOpen: x = "auto",
    focusItemOnHover: R = !0,
    openOnArrowKeyDown: w = !0,
    disabledIndices: D = void 0,
    orientation: T = "vertical",
    parentOrientation: N,
    id: A,
    resetOnPointerLeave: E = !0,
    externalTree: z,
    grid: U
  } = o, j = U != null, O = "rootStore" in n ? n.rootStore : n, k = O.useState("open"), G = O.useState("floatingElement"), P = O.useState("domReferenceElement"), ne = O.context.dataRef, K = mu(G), Q = np(P), Z = Yt(K), q = Kl(), _ = No(z), Y = y.useRef(x), B = y.useRef(p ?? -1), F = y.useRef(null), I = y.useRef(!0), M = ze((ae) => {
    c(B.current === -1 ? null : B.current, ae);
  }), H = y.useRef(!!G), te = y.useRef(k), J = y.useRef(!1), re = y.useRef(!1), ie = y.useRef(null), oe = Yt(D), se = Yt(k), ge = Yt(p), je = Yt(E), Ee = na(), fe = na(), ye = ze(() => {
    function ae(be) {
      b ? _?.events.emit("virtualfocus", be) : ie.current = au(be, {
        sync: J.current,
        preventScroll: !0
      });
    }
    const pe = a.current[B.current], Ue = re.current;
    pe && ae(pe), (J.current ? (be) => be() : (be) => Ee.request(be))(() => {
      const be = a.current[B.current] || pe;
      if (!be)
        return;
      pe || ae(be), // eslint-disable-next-line @typescript-eslint/no-use-before-define
      he && (Ue || !I.current) && be.scrollIntoView?.({
        block: "nearest",
        inline: "nearest"
      });
    });
  });
  xe(() => {
    ne.current.orientation = T;
  }, [ne, T]), xe(() => {
    f && (k && G ? (B.current = p ?? -1, Y.current && p != null && (re.current = !0, M())) : H.current && (B.current = -1, M()));
  }, [f, k, G, p, M]), xe(() => {
    if (f) {
      if (!k) {
        J.current = !1;
        return;
      }
      if (G)
        if (i == null) {
          if (J.current = !1, ge.current != null)
            return;
          if (H.current && (B.current = -1, ye()), (!te.current || !H.current) && Y.current && (F.current != null || Y.current === !0 && F.current == null)) {
            let ae = 0;
            const pe = () => {
              a.current[0] == null ? (ae < 2 && (ae ? (ve) => fe.request(ve) : queueMicrotask)(pe), ae += 1) : (B.current = F.current == null || Pd(F.current, T, v) || d ? ru(a) : rp(a), F.current = null, M());
            };
            pe();
          }
        } else ui(a.current, i) || (B.current = i, ye(), re.current = !1);
    }
  }, [f, k, G, i, ge, d, a, T, v, M, ye, fe]), xe(() => {
    if (!f || G || !_ || b || !H.current)
      return;
    const ae = _.nodesRef.current, pe = ae.find((be) => be.id === q)?.context?.elements.floating, Ue = vn(tt(P ?? pe ?? null)), ve = ae.some((be) => be.context && Le(be.context.elements.floating, Ue));
    pe && !ve && I.current && pe.focus({
      preventScroll: !0
    });
  }, [f, G, P, _, q, b]), xe(() => {
    te.current = k, H.current = !!G;
  }), xe(() => {
    k || (F.current = null, Y.current = x);
  }, [k, x]);
  const Re = i != null, _e = ze((ae) => {
    if (!se.current)
      return;
    const pe = a.current.indexOf(ae.currentTarget);
    pe !== -1 && (B.current !== pe || i !== pe) && (B.current = pe, M(ae));
  }), ke = ze(() => N ?? _?.nodesRef.current.find((ae) => ae.id === q)?.context?.dataRef?.current.orientation), we = ze(() => ru(a, oe.current)), Ce = ze((ae) => {
    if (I.current = !1, J.current = !0, ae.which === 229 || !se.current && ae.currentTarget === Z.current)
      return;
    if (d && JC(ae.key, T, v, j)) {
      Ks(ae.key, ke()) || fl(ae), O.setOpen(!1, Ye(lp, ae.nativeEvent)), Rt(P) && (b ? _?.events.emit("virtualfocus", P) : P.focus());
      return;
    }
    const pe = B.current, Ue = ru(a, D), ve = rp(a, D);
    if (Q || (ae.key === "Home" && (fl(ae), B.current = Ue, M(ae)), ae.key === "End" && (fl(ae), B.current = ve, M(ae))), U != null) {
      const be = U(ae, B.current, a, T, m, v, D, Ue, ve);
      if (be != null && (B.current = be, M(ae)), T === "both")
        return;
    }
    if (Ks(ae.key, T)) {
      if (fl(ae), k && !b && vn(ae.currentTarget.ownerDocument) === ae.currentTarget) {
        B.current = Pd(ae.key, T, v) ? Ue : ve, M(ae);
        return;
      }
      Pd(ae.key, T, v) ? m ? pe >= ve ? g && pe !== a.current.length ? B.current = -1 : (J.current = !1, B.current = Ue) : B.current = Il(a.current, {
        startingIndex: pe,
        disabledIndices: D
      }) : B.current = Math.min(ve, Il(a.current, {
        startingIndex: pe,
        disabledIndices: D
      })) : m ? pe <= Ue ? g && pe !== -1 ? B.current = a.current.length : (J.current = !1, B.current = ve) : B.current = Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: D
      }) : B.current = Math.max(Ue, Il(a.current, {
        startingIndex: pe,
        decrement: !0,
        disabledIndices: D
      })), ui(a.current, B.current) && (B.current = -1), M(ae);
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
      if (!se.current || !I.current || pe.pointerType === "touch")
        return;
      J.current = !0;
      const Ue = pe.relatedTarget;
      if (!(!R || a.current.includes(Ue)) && je.current && (ie.current?.(), ie.current = null, B.current = -1, M(pe), !b)) {
        const ve = Z.current, be = vn(tt(ve));
        ve && Le(ve, be) && ve.focus({
          preventScroll: !0
        });
      }
    }
  }), [_e, se, Z, R, a, M, je, b]), Se = y.useMemo(() => b && k && Re && {
    "aria-activedescendant": `${A}-${i}`
  }, [b, k, Re, A, i]), Te = y.useMemo(() => ({
    "aria-orientation": T === "both" ? void 0 : T,
    ...Q ? {} : Se,
    onKeyDown(ae) {
      if (ae.key === "Tab" && ae.shiftKey && k && !b) {
        const pe = gn(ae.nativeEvent);
        if (pe && !Le(Z.current, pe))
          return;
        fl(ae), O.setOpen(!1, Ye(To, ae.nativeEvent)), Rt(P) && P.focus();
        return;
      }
      Ce(ae);
    },
    onPointerMove() {
      I.current = !0;
    }
  }), [Se, Ce, Z, T, Q, O, k, b, P]), Oe = y.useMemo(() => {
    function ae(ve) {
      O.setOpen(!0, Ye(lp, ve.nativeEvent, ve.currentTarget));
    }
    function pe(ve) {
      x === "auto" && zp(ve.nativeEvent) && (Y.current = !b);
    }
    function Ue(ve) {
      Y.current = x, x === "auto" && e0(ve.nativeEvent) && (Y.current = !0);
    }
    return {
      onKeyDown(ve) {
        const be = O.select("open");
        I.current = !1;
        const We = ve.key.startsWith("Arrow"), rt = ZC(ve.key, ke(), v), pt = Ks(ve.key, T), Dt = (d ? rt : pt) || ve.key === "Enter" || ve.key.trim() === "";
        if (b && be)
          return Ce(ve);
        if (!(!be && !w && We)) {
          if (Dt) {
            const et = Ks(ve.key, ke());
            F.current = d && et ? null : ve.key;
          }
          if (d) {
            rt && (fl(ve), be ? (B.current = we(), M(ve)) : ae(ve));
            return;
          }
          pt && (ge.current != null && (B.current = ge.current), fl(ve), !be && w ? ae(ve) : Ce(ve), be && M(ve));
        }
      },
      onFocus(ve) {
        O.select("open") && !b && (B.current = -1, M(ve));
      },
      onPointerDown: Ue,
      onPointerEnter: Ue,
      onMouseDown: pe,
      onClick: pe
    };
  }, [Ce, x, we, d, M, O, w, T, ke, v, ge, b]), He = y.useMemo(() => ({
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
function ex(n, o) {
  const {
    listRef: a,
    elementsRef: i,
    activeIndex: c,
    onMatch: f,
    disabledIndices: p,
    onTyping: g,
    enabled: m = !0,
    resetMs: d = 750,
    selectedIndex: v = null
  } = o, b = "rootStore" in n ? n.rootStore : n, x = b.useState("open"), R = an(), w = y.useRef(""), D = y.useRef(v ?? c ?? -1), T = y.useRef(null), N = ze((z) => {
    function U(Z) {
      const q = i?.current[Z];
      return !q || Uu(q);
    }
    function j(Z) {
      return U(Z) ? p == null || !vu(Gl, Z, p) : !1;
    }
    function O(Z, q, _ = 0) {
      if (Z.length === 0)
        return -1;
      const Y = (_ % Z.length + Z.length) % Z.length, B = q.toLowerCase();
      for (let F = 0; F < Z.length; F += 1) {
        const I = (Y + F) % Z.length;
        if (!(!Z[I]?.toLowerCase().startsWith(B) || !j(I)))
          return I;
      }
      return -1;
    }
    const k = a.current;
    if (w.current.length > 0 && z.key === " " && (fl(z), g?.(!0)), w.current.length > 0 && w.current[0] !== " " && O(k, w.current) === -1 && z.key !== " " && g?.(!1), k == null || // Character key.
    z.key.length !== 1 || // Modifier key.
    z.ctrlKey || z.metaKey || z.altKey)
      return;
    x && z.key !== " " && (fl(z), g?.(!0));
    const G = w.current === "";
    G && (D.current = v ?? c ?? -1), k.every((Z, q) => Z && j(q) ? Z[0]?.toLowerCase() !== Z[1]?.toLowerCase() : !0) && w.current === z.key && (w.current = "", D.current = T.current), w.current += z.key, R.start(d, () => {
      w.current = "", D.current = T.current, g?.(!1);
    });
    const K = ((G ? v ?? c ?? -1 : D.current) ?? 0) + 1, Q = O(k, w.current, K);
    Q !== -1 ? (f?.(Q), T.current = Q) : z.key !== " " && (w.current = "", g?.(!1));
  }), A = ze((z) => {
    const U = z.relatedTarget, j = b.select("domReferenceElement"), O = b.select("floatingElement");
    Le(j, U) || Le(O, U) || (R.clear(), w.current = "", D.current = T.current, g?.(!1));
  });
  xe(() => {
    !x && v !== null || (R.clear(), T.current = null, w.current !== "" && (w.current = ""));
  }, [x, v, R]), xe(() => {
    x && w.current === "" && (D.current = v ?? c ?? -1);
  }, [x, v, c]);
  const E = y.useMemo(() => ({
    onKeyDown: N,
    onBlur: A
  }), [N, A]);
  return y.useMemo(() => m ? {
    reference: E,
    floating: E
  } : {}, [m, E]);
}
const nb = 0.1, $C = nb * nb, Tt = 0.5;
function Qs(n, o, a, i, c, f) {
  return i >= o != f >= o && n <= (c - a) * (o - i) / (f - i) + a;
}
function Zs(n, o, a, i, c, f, p, g, m, d) {
  let v = !1;
  return Qs(n, o, a, i, c, f) && (v = !v), Qs(n, o, c, f, p, g) && (v = !v), Qs(n, o, p, g, m, d) && (v = !v), Qs(n, o, m, d, a, i) && (v = !v), v;
}
function WC(n, o, a) {
  return n >= a.x && n <= a.x + a.width && o >= a.y && o <= a.y + a.height;
}
function Js(n, o, a, i, c, f) {
  const p = Math.min(a, c), g = Math.max(a, c), m = Math.min(i, f), d = Math.max(i, f);
  return n >= p && n <= g && o >= m && o <= d;
}
function $u(n = {}) {
  const {
    blockPointerEvents: o = !1
  } = n, a = new el(), i = ({
    x: c,
    y: f,
    placement: p,
    elements: g,
    onClose: m,
    nodeId: d,
    tree: v
  }) => {
    const b = p?.split("-")[0];
    let x = !1, R = null, w = null, D = typeof performance < "u" ? performance.now() : 0;
    function T(A, E) {
      const z = performance.now(), U = z - D;
      if (R === null || w === null || U === 0)
        return R = A, w = E, D = z, !1;
      const j = A - R, O = E - w, k = j * j + O * O, G = U * U * $C;
      return R = A, w = E, D = z, k < G;
    }
    function N() {
      a.clear(), m();
    }
    return function(E) {
      a.clear();
      const z = g.domReference, U = g.floating;
      if (!z || !U || b == null || c == null || f == null)
        return;
      const {
        clientX: j,
        clientY: O
      } = E, k = gn(E), G = E.type === "mouseleave", P = Le(U, k), ne = Le(z, k);
      if (P && (x = !0, !G))
        return;
      if (ne && (x = !1, !G)) {
        x = !0;
        return;
      }
      if (G && $e(E.relatedTarget) && Le(U, E.relatedTarget))
        return;
      function K() {
        return !!(v && Co(v.nodesRef.current, d).length > 0);
      }
      function Q() {
        K() || N();
      }
      if (K())
        return;
      const Z = z.getBoundingClientRect(), q = U.getBoundingClientRect(), _ = c > q.right - q.width / 2, Y = f > q.bottom - q.height / 2, B = q.width > Z.width, F = q.height > Z.height, I = (B ? Z : q).left, M = (B ? Z : q).right, H = (F ? Z : q).top, te = (F ? Z : q).bottom;
      if (b === "top" && f >= Z.bottom - 1 || b === "bottom" && f <= Z.top + 1 || b === "left" && c >= Z.right - 1 || b === "right" && c <= Z.left + 1) {
        Q();
        return;
      }
      let J = !1;
      switch (b) {
        case "top":
          J = Js(j, O, I, Z.top + 1, M, q.bottom - 1);
          break;
        case "bottom":
          J = Js(j, O, I, q.top + 1, M, Z.bottom - 1);
          break;
        case "left":
          J = Js(j, O, q.right - 1, te, Z.left + 1, H);
          break;
        case "right":
          J = Js(j, O, Z.right - 1, te, q.left + 1, H);
          break;
      }
      if (J)
        return;
      if (x && !WC(j, O, Z)) {
        Q();
        return;
      }
      if (!G && T(j, O)) {
        Q();
        return;
      }
      let re = !1;
      switch (b) {
        case "top": {
          const ie = B ? Tt / 2 : Tt * 4, oe = B || _ ? c + ie : c - ie, se = B ? c - ie : _ ? c + ie : c - ie, ge = f + Tt + 1, je = _ || B ? q.bottom - Tt : q.top, Ee = _ ? B ? q.bottom - Tt : q.top : q.bottom - Tt;
          re = Zs(j, O, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "bottom": {
          const ie = B ? Tt / 2 : Tt * 4, oe = B || _ ? c + ie : c - ie, se = B ? c - ie : _ ? c + ie : c - ie, ge = f - Tt, je = _ || B ? q.top + Tt : q.bottom, Ee = _ ? B ? q.top + Tt : q.bottom : q.top + Tt;
          re = Zs(j, O, oe, ge, se, ge, q.left, je, q.right, Ee);
          break;
        }
        case "left": {
          const ie = F ? Tt / 2 : Tt * 4, oe = F || Y ? f + ie : f - ie, se = F ? f - ie : Y ? f + ie : f - ie, ge = c + Tt + 1, je = Y || F ? q.right - Tt : q.left, Ee = Y ? F ? q.right - Tt : q.left : q.right - Tt;
          re = Zs(j, O, je, q.top, Ee, q.bottom, ge, oe, ge, se);
          break;
        }
        case "right": {
          const ie = F ? Tt / 2 : Tt * 4, oe = F || Y ? f + ie : f - ie, se = F ? f - ie : Y ? f + ie : f - ie, ge = c - Tt, je = Y || F ? q.left + Tt : q.right, Ee = Y ? F ? q.left + Tt : q.right : q.left + Tt;
          re = Zs(j, O, ge, oe, ge, se, je, q.top, Ee, q.bottom);
          break;
        }
      }
      re ? x || a.start(40, Q) : Q();
    };
  };
  return i.__options = {
    ...n,
    blockPointerEvents: o
  }, i;
}
function eO(n) {
  const {
    store: o,
    actionsRef: a
  } = n, i = o.useState("open");
  K0(o, i), qu(o);
  const {
    forceUnmount: c
  } = Xu(i, o), f = y.useCallback(() => {
    o.setOpen(!1, Ye(Hu));
  }, [o]);
  y.useImperativeHandle(a, () => ({
    unmount: c,
    close: f
  }), [c, f]);
}
function tO({
  store: n,
  parentContext: o,
  isDrawer: a
}) {
  const i = n.useState("open"), c = n.useState("disablePointerDismissal"), f = n.useState("modal"), p = n.useState("popupElement"), g = n.useState("floatingRootContext"), [m, d] = y.useState(0), [v, b] = y.useState(0), x = m === 0, R = Ei(g, {
    outsidePressEvent() {
      return n.context.internalBackdropRef.current || n.context.backdropRef.current ? "intentional" : {
        mouse: f === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(N) {
      if (!n.context.outsidePressEnabledRef.current || "button" in N && N.button !== 0 || "touches" in N && N.touches.length !== 1)
        return !1;
      const A = gn(N);
      return x && !c ? f && (n.context.internalBackdropRef.current || n.context.backdropRef.current) ? n.context.internalBackdropRef.current === A || n.context.backdropRef.current === A || Le(A, p) && !A?.hasAttribute("data-base-ui-portal") : !0 : !1;
    },
    escapeKey: x
  });
  Wb(i && f === !0, p), n.useContextCallback("onNestedDialogOpen", (N, A) => {
    d(N), b(A);
  }), n.useContextCallback("onNestedDialogClose", () => {
    d(0), b(0);
  }), y.useEffect(() => (o?.onNestedDialogOpen && i && o.onNestedDialogOpen(m + 1, v + (a ? 1 : 0)), o?.onNestedDialogClose && !i && o.onNestedDialogClose(), () => {
    o?.onNestedDialogClose && i && o.onNestedDialogClose();
  }), [a, i, m, v, o]);
  const w = R.reference ?? bt, D = R.trigger ?? bt, T = R.floating ?? bt;
  return Fu(n, {
    activeTriggerProps: w,
    inactiveTriggerProps: D,
    popupProps: T,
    nestedOpenDialogCount: m,
    nestedOpenDrawerCount: v
  }), null;
}
const tx = /* @__PURE__ */ y.createContext(!1), nx = /* @__PURE__ */ y.createContext(void 0);
function cr(n) {
  const o = y.useContext(nx);
  if (n === !1 && o === void 0)
    throw new Error(Mt(27));
  return o;
}
const nO = {
  ...Qu,
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
class Wp extends Ti {
  constructor(o, a, i = !1) {
    const c = new sa(), f = lO(o);
    f.floatingRootContext = Kp(c, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      outsidePressEnabledRef: {
        current: !0
      },
      triggerElements: c,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, nO);
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
    Gu(i, o, a.trigger), this.update(i);
  };
  static useStore(o, a) {
    return Gp(o, (c, f) => new Wp(a, c, f), !0).store;
  }
}
function lO(n = {}) {
  return {
    ...Ku(),
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
function lx(n, o = "dialog") {
  const {
    children: a,
    open: i,
    defaultOpen: c = !1,
    onOpenChange: f,
    onOpenChangeComplete: p,
    disablePointerDismissal: g = !1,
    modal: m = !0,
    actionsRef: d,
    handle: v,
    triggerId: b,
    defaultTriggerId: x = null
  } = n, R = o === "drawer", w = o === "alert-dialog", D = w ? !0 : m, T = w || g, N = w ? "alertdialog" : "dialog", A = cr(!0), z = {
    modal: D,
    disablePointerDismissal: T,
    nested: !!A,
    role: N
  }, U = Wp.useStore(v?.store, {
    open: c,
    openProp: i,
    activeTriggerId: x,
    triggerIdProp: b,
    ...z
  });
  Cp(() => {
    const ne = i === void 0 && U.state.open === !1 && c === !0 ? {
      open: !0,
      activeTriggerId: x
    } : null;
    w ? U.update(ne ? {
      ...z,
      ...ne
    } : z) : ne && U.update(ne);
  }), U.useControlledProp("openProp", i), U.useControlledProp("triggerIdProp", b), U.useSyncedValues(z), U.useContextCallback("onOpenChange", f), U.useContextCallback("onOpenChangeComplete", p);
  const j = U.useState("open"), O = U.useState("mounted"), k = U.useState("payload");
  eO({
    store: U,
    actionsRef: d
  });
  const G = j || O, P = y.useMemo(() => ({
    store: U
  }), [U]);
  return /* @__PURE__ */ S.jsx(tx.Provider, {
    value: !1,
    children: /* @__PURE__ */ S.jsxs(nx.Provider, {
      value: P,
      children: [G && /* @__PURE__ */ S.jsx(tO, {
        store: U,
        parentContext: A?.store.context,
        isDrawer: R
      }), typeof a == "function" ? a({
        payload: k
      }) : a]
    })
  });
}
function oO(n) {
  return lx(n, "alert-dialog");
}
let lr = (function(n) {
  return n.open = "data-open", n.closed = "data-closed", n[n.startingStyle = bi.startingStyle] = "startingStyle", n[n.endingStyle = bi.endingStyle] = "endingStyle", n.anchorHidden = "data-anchor-hidden", n.side = "data-side", n.align = "data-align", n;
})({}), wu = /* @__PURE__ */ (function(n) {
  return n.popupOpen = "data-popup-open", n.pressed = "data-pressed", n;
})({});
const rO = {
  [wu.popupOpen]: ""
}, aO = {
  [wu.popupOpen]: "",
  [wu.pressed]: ""
}, iO = {
  [lr.open]: ""
}, sO = {
  [lr.closed]: ""
}, uO = {
  [lr.anchorHidden]: ""
}, Wu = {
  open(n) {
    return n ? rO : null;
  }
}, Eu = {
  open(n) {
    return n ? aO : null;
  }
}, ko = {
  open(n) {
    return n ? iO : sO;
  },
  anchorHidden(n) {
    return n ? uO : null;
  }
}, cO = {
  ...ko,
  ...jo
}, ox = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    forceRender: p = !1,
    ...g
  } = o, {
    store: m
  } = cr(), d = m.useState("open"), v = m.useState("nested"), b = m.useState("mounted"), x = m.useState("transitionStatus");
  return nt("div", o, {
    state: {
      open: d,
      transitionStatus: x
    },
    ref: [m.context.backdropRef, a],
    stateAttributesMapping: cO,
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
}), rx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    ...m
  } = o, {
    store: d
  } = cr(), v = d.useState("open"), {
    getButtonProps: b,
    buttonRef: x
  } = Oo({
    disabled: p,
    native: g
  }), R = {
    disabled: p
  };
  function w(D) {
    v && d.setOpen(!1, Ye(o0, D.nativeEvent));
  }
  return nt("button", o, {
    state: R,
    ref: [a, x],
    props: [{
      onClick: w
    }, m, b]
  });
});
function Bn(n) {
  return rr(n, "base-ui");
}
const ax = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = cr(), d = Bn(p);
  return m.useSyncedValueWithCleanup("descriptionElementId", d), nt("p", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
let fO = /* @__PURE__ */ (function(n) {
  return n.nestedDialogs = "--nested-dialogs", n;
})({}), dO = (function(n) {
  return n[n.open = lr.open] = "open", n[n.closed = lr.closed] = "closed", n[n.startingStyle = lr.startingStyle] = "startingStyle", n[n.endingStyle = lr.endingStyle] = "endingStyle", n.nested = "data-nested", n.nestedDialogOpen = "data-nested-dialog-open", n;
})({});
const ix = /* @__PURE__ */ y.createContext(void 0);
function pO() {
  const n = y.useContext(ix);
  if (n === void 0)
    throw new Error(Mt(26));
  return n;
}
const fi = "ArrowUp", di = "ArrowDown", Tu = "ArrowLeft", Ru = "ArrowRight", ec = "Home", tc = "End", sx = /* @__PURE__ */ new Set([Tu, Ru]), gO = /* @__PURE__ */ new Set([Tu, Ru, ec, tc]), ux = /* @__PURE__ */ new Set([fi, di]), mO = /* @__PURE__ */ new Set([fi, di, ec, tc]), cx = /* @__PURE__ */ new Set([...sx, ...ux]), Ri = /* @__PURE__ */ new Set([...cx, ec, tc]), hO = "Shift", yO = "Control", vO = "Alt", bO = "Meta", xO = /* @__PURE__ */ new Set([hO, yO, vO, bO]);
function SO(n) {
  return Rt(n) && n.tagName === "INPUT";
}
function lb(n) {
  return !!(SO(n) && n.selectionStart != null || Rt(n) && n.tagName === "TEXTAREA");
}
function ob(n, o, a, i) {
  if (!n || !o || !o.scrollTo)
    return;
  let c = n.scrollLeft, f = n.scrollTop;
  const p = n.clientWidth < n.scrollWidth, g = n.clientHeight < n.scrollHeight;
  if (p && i !== "vertical") {
    const m = rb(n, o, "left"), d = $s(n), v = $s(o);
    a === "ltr" && (m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight ? c = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight : m - v.scrollMarginLeft < n.scrollLeft + d.scrollPaddingLeft && (c = m - v.scrollMarginLeft - d.scrollPaddingLeft)), a === "rtl" && (m - v.scrollMarginRight < n.scrollLeft + d.scrollPaddingLeft ? c = m - v.scrollMarginLeft - d.scrollPaddingLeft : m + o.offsetWidth + v.scrollMarginRight > n.scrollLeft + n.clientWidth - d.scrollPaddingRight && (c = m + o.offsetWidth + v.scrollMarginRight - n.clientWidth + d.scrollPaddingRight));
  }
  if (g && i !== "horizontal") {
    const m = rb(n, o, "top"), d = $s(n), v = $s(o);
    m - v.scrollMarginTop < n.scrollTop + d.scrollPaddingTop ? f = m - v.scrollMarginTop - d.scrollPaddingTop : m + o.offsetHeight + v.scrollMarginBottom > n.scrollTop + n.clientHeight - d.scrollPaddingBottom && (f = m + o.offsetHeight + v.scrollMarginBottom - n.clientHeight + d.scrollPaddingBottom);
  }
  n.scrollTo({
    left: c,
    top: f,
    behavior: "auto"
  });
}
function rb(n, o, a) {
  const i = a === "left" ? "offsetLeft" : "offsetTop";
  let c = 0;
  for (; o.offsetParent && (c += o[i], o.offsetParent !== n); )
    o = o.offsetParent;
  return c;
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
const wO = {
  ...ko,
  ...jo,
  nestedDialogOpen(n) {
    return n ? {
      [dO.nestedDialogOpen]: ""
    } : null;
  }
}, fx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    finalFocus: p,
    initialFocus: g,
    ...m
  } = o, {
    store: d
  } = cr(), v = d.useState("descriptionElementId"), b = d.useState("disablePointerDismissal"), x = d.useState("floatingRootContext"), R = d.useState("popupProps"), w = d.useState("modal"), D = d.useState("mounted"), T = d.useState("nested"), N = d.useState("nestedOpenDialogCount"), A = d.useState("open"), E = d.useState("openMethod"), z = d.useState("titleElementId"), U = d.useState("transitionStatus"), j = d.useState("role"), O = x.useState("floatingId"), k = m.id ?? O;
  pO(), Ql({
    open: A,
    ref: d.context.popupRef,
    onComplete() {
      A && d.context.onOpenChangeComplete?.(!0);
    }
  });
  const G = g === void 0 ? X0(d.context.popupRef) : g, P = N > 0, ne = d.useStateSetter("popupElement"), Q = nt("div", o, {
    state: {
      open: A,
      nested: T,
      transitionStatus: U,
      nestedDialogOpen: P
    },
    props: [R, {
      id: k,
      "aria-labelledby": z ?? void 0,
      "aria-describedby": v ?? void 0,
      role: j,
      ...ia,
      hidden: !D,
      onKeyDown(Z) {
        Ri.has(Z.key) && Z.stopPropagation();
      },
      style: {
        [fO.nestedDialogs]: N
      }
    }, m],
    ref: [a, d.context.popupRef, ne],
    stateAttributesMapping: wO
  });
  return /* @__PURE__ */ S.jsx(Iu, {
    context: x,
    openInteractionType: E,
    disabled: !D,
    closeOnFocusOut: !b,
    initialFocus: G,
    returnFocus: p,
    modal: w !== !1,
    restoreFocus: "popup",
    children: Q
  });
});
function nc(n) {
  return Ep(19) ? n : n ? "true" : void 0;
}
const lc = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    cutout: i,
    ...c
  } = o;
  let f;
  if (i) {
    const p = i.getBoundingClientRect();
    f = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${p.left}px ${p.top}px,${p.left}px ${p.bottom}px,${p.right}px ${p.bottom}px,${p.right}px ${p.top}px,${p.left}px ${p.top}px)`;
  }
  return /* @__PURE__ */ S.jsx("div", {
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
}), dx = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = o, {
    store: f
  } = cr(), p = f.useState("mounted"), g = f.useState("modal"), m = f.useState("open");
  return p || i ? /* @__PURE__ */ S.jsx(ix.Provider, {
    value: i,
    children: /* @__PURE__ */ S.jsxs(Lu, {
      ref: a,
      ...c,
      children: [p && g === !0 && /* @__PURE__ */ S.jsx(lc, {
        ref: f.context.internalBackdropRef,
        inert: nc(!m)
      }), o.children]
    })
  }) : null;
}), px = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = o, {
    store: m
  } = cr(), d = Bn(p);
  return m.useSyncedValueWithCleanup("titleElementId", d), nt("h2", o, {
    ref: a,
    props: [{
      id: d
    }, g]
  });
});
function EO(n) {
  const o = y.useRef(""), a = y.useCallback((c) => {
    c.defaultPrevented || (o.current = c.pointerType, n(c, c.pointerType));
  }, [n]);
  return {
    onClick: y.useCallback((c) => {
      if (c.detail === 0) {
        n(c, "keyboard");
        return;
      }
      "pointerType" in c ? n(c, c.pointerType) : n(c, o.current), o.current = "";
    }, [n]),
    onPointerDown: a
  };
}
function gx(n, o) {
  const a = y.useRef(n), i = ze(o);
  xe(() => {
    a.current !== n && i(a.current);
  }, [n, i]), xe(() => {
    a.current = n;
  }, [n]);
}
function mx(n, o) {
  const a = ze((f, p) => {
    (typeof n == "function" ? n() : n) || o(p || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
    // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
    // will be "" in that case.
    (Du ? "touch" : ""));
  }), {
    onClick: i,
    onPointerDown: c
  } = EO(a);
  return y.useMemo(() => ({
    onClick: i,
    onPointerDown: c
  }), [i, c]);
}
function hx(n) {
  const [o, a] = y.useState(null), i = mx(n, a);
  return gx(n, (c) => {
    c && !n && a(null);
  }), y.useMemo(() => ({
    openMethod: o,
    triggerProps: i
  }), [o, i]);
}
function TO({ ...n }) {
  return /* @__PURE__ */ S.jsx(oO, { "data-slot": "alert-dialog", ...n });
}
function RO({ ...n }) {
  return /* @__PURE__ */ S.jsx(dx, { "data-slot": "alert-dialog-portal", ...n });
}
function CO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    ox,
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
function OO({
  className: n,
  size: o = "default",
  ...a
}) {
  return /* @__PURE__ */ S.jsxs(RO, { children: [
    /* @__PURE__ */ S.jsx(CO, {}),
    /* @__PURE__ */ S.jsx(
      fx,
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
function MO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
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
const AO = aa(
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
function zO({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ S.jsx(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: Ke(AO({ variant: o }), n),
      ...a
    }
  );
}
const DO = aa(
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
function NO({
  className: n,
  variant: o = "default",
  ...a
}) {
  return /* @__PURE__ */ S.jsx(
    "div",
    {
      "data-slot": "alert-dialog-media",
      className: Ke(DO({ variant: o }), n),
      ...a
    }
  );
}
function jO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    px,
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
function kO({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    ax,
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
function _O({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    _t,
    {
      "data-slot": "alert-dialog-action",
      className: Ke(n),
      ...o
    }
  );
}
function HO({
  className: n,
  variant: o = "outline",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ S.jsx(
    rx,
    {
      "data-slot": "alert-dialog-cancel",
      className: Ke(n),
      render: /* @__PURE__ */ S.jsx(_t, { variant: o, size: a }),
      ...i
    }
  );
}
const yx = /* @__PURE__ */ y.createContext(void 0);
function oc(n) {
  const o = y.useContext(yx);
  if (o === void 0 && !n)
    throw new Error(Mt(33));
  return o;
}
const vx = /* @__PURE__ */ y.createContext(void 0);
function ml(n) {
  const o = y.useContext(vx);
  if (o === void 0 && !n)
    throw new Error(Mt(36));
  return o;
}
const UO = /* @__PURE__ */ y.createContext(void 0);
function rc(n = !0) {
  const o = y.useContext(UO);
  if (o === void 0 && !n)
    throw new Error(Mt(25));
  return o;
}
function ra({
  controlled: n,
  default: o,
  name: a,
  state: i = "value"
}) {
  const {
    current: c
  } = y.useRef(n !== void 0), [f, p] = y.useState(o), g = c ? n : f, m = y.useCallback((d) => {
    c || p(d);
  }, []);
  return [g, m];
}
const bx = /* @__PURE__ */ y.createContext(void 0);
function LO() {
  const n = y.useContext(bx);
  if (n === void 0)
    throw new Error(Mt(30));
  return n;
}
function IO(n) {
  const {
    closeOnClick: o,
    highlighted: a,
    id: i,
    nodeId: c,
    store: f,
    typingRef: p,
    itemRef: g,
    itemMetadata: m
  } = n, {
    events: d
  } = f.useState("floatingTreeRoot"), v = f.useState("open"), b = rc(!0), x = b !== void 0;
  return y.useMemo(() => ({
    id: i,
    role: "menuitem",
    tabIndex: v && a ? 0 : -1,
    onKeyDown(R) {
      R.key === " " && p?.current && R.preventDefault();
    },
    onMouseMove(R) {
      c && d.emit("itemhover", {
        nodeId: c,
        target: R.currentTarget
      });
    },
    onClick(R) {
      o && d.emit("close", {
        domEvent: R,
        reason: $r
      });
    },
    onMouseUp(R) {
      if (b) {
        const w = b.initialCursorPointRef.current;
        if (b.initialCursorPointRef.current = null, x && w && Math.abs(R.clientX - w.x) <= 1 && Math.abs(R.clientY - w.y) <= 1 || x && !Op && R.button === 2)
          return;
      }
      g.current && f.context.allowMouseUpTriggerRef.current && (!x || R.button === 2) && (!m || m.type === "regular-item") && g.current.click();
    }
  }), [o, a, i, d, c, v, f, p, g, b, x, m]);
}
const xx = {
  type: "regular-item"
};
function eg(n) {
  const {
    closeOnClick: o,
    disabled: a = !1,
    highlighted: i,
    id: c,
    store: f,
    typingRef: p = f.context.typingRef,
    nativeButton: g,
    itemMetadata: m,
    nodeId: d
  } = n, v = f.useState("disabled"), b = a || v, x = y.useRef(null), {
    getButtonProps: R,
    buttonRef: w
  } = Oo({
    disabled: b,
    focusableWhenDisabled: !0,
    native: g,
    composite: !0
  }), D = IO({
    closeOnClick: o,
    highlighted: i,
    id: c,
    nodeId: d,
    store: f,
    typingRef: p,
    itemRef: x,
    itemMetadata: m
  }), T = y.useCallback((A) => bn(D, {
    onMouseEnter() {
      m.type === "submenu-trigger" && m.setActive();
    }
  }, A, R), [D, R, m]), N = Eo(x, w);
  return y.useMemo(() => ({
    getItemProps: T,
    itemRef: N
  }), [T, N]);
}
const Sx = /* @__PURE__ */ y.createContext({
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
function BO() {
  return y.useContext(Sx);
}
let wx = /* @__PURE__ */ (function(n) {
  return n[n.None = 0] = "None", n[n.GuessFromOrder = 1] = "GuessFromOrder", n;
})({});
function Ci(n = {}) {
  const {
    label: o,
    metadata: a,
    textRef: i,
    indexGuessBehavior: c,
    index: f
  } = n, {
    register: p,
    unregister: g,
    subscribeMapChange: m,
    elementsRef: d,
    labelsRef: v,
    nextIndexRef: b
  } = BO(), x = y.useRef(-1), [R, w] = y.useState(f ?? (c === wx.GuessFromOrder ? () => {
    if (x.current === -1) {
      const N = b.current;
      b.current += 1, x.current = N;
    }
    return x.current;
  } : -1)), D = y.useRef(null), T = y.useCallback((N) => {
    if (D.current = N, R !== -1 && N !== null && (d.current[R] = N, v)) {
      const A = o !== void 0;
      v.current[R] = A ? o : i?.current?.textContent ?? N.textContent;
    }
  }, [R, d, v, o, i]);
  return xe(() => {
    if (f != null)
      return;
    const N = D.current;
    if (N)
      return p(N, a), () => {
        g(N);
      };
  }, [f, p, g, a]), xe(() => {
    if (f == null)
      return m((N) => {
        const A = D.current ? N.get(D.current)?.index : null;
        A != null && w(A);
      });
  }, [f, m, w]), {
    ref: T,
    index: R
  };
}
let ab = /* @__PURE__ */ (function(n) {
  return n.checked = "data-checked", n.unchecked = "data-unchecked", n.disabled = "data-disabled", n.highlighted = "data-highlighted", n;
})({});
const Ex = {
  checked(n) {
    return n ? {
      [ab.checked]: ""
    } : {
      [ab.unchecked]: ""
    };
  },
  ...jo
}, VO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !1,
    checked: v,
    defaultChecked: b,
    onCheckedChange: x,
    style: R,
    ...w
  } = o, D = Ci({
    label: p
  }), T = oc(!0), N = Bn(f), {
    store: A
  } = ml(), E = A.useState("isActive", D.index), z = A.useState("itemProps"), [U, j] = ra({
    controlled: v,
    default: b ?? !1,
    name: "MenuCheckboxItem",
    state: "checked"
  }), {
    getItemProps: O,
    itemRef: k
  } = eg({
    closeOnClick: d,
    disabled: m,
    highlighted: E,
    id: N,
    store: A,
    nativeButton: g,
    nodeId: T?.context.nodeId,
    itemMetadata: xx
  }), G = y.useMemo(() => ({
    disabled: m,
    highlighted: E,
    checked: U
  }), [m, E, U]);
  function P(K) {
    const Q = Ye($r, K.nativeEvent, void 0, {
      preventUnmountOnClose() {
      }
    });
    x?.(!U, Q), !Q.isCanceled && j((Z) => !Z);
  }
  const ne = nt("div", o, {
    state: G,
    stateAttributesMapping: Ex,
    props: [z, {
      role: "menuitemcheckbox",
      "aria-checked": U,
      onClick: P
    }, w, O],
    ref: [k, a, D.ref]
  });
  return /* @__PURE__ */ S.jsx(bx.Provider, {
    value: G,
    children: ne
  });
}), PO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    keepMounted: p = !1,
    ...g
  } = o, m = LO(), d = y.useRef(null), {
    transitionStatus: v,
    setMounted: b
  } = Yu(m.checked);
  Ql({
    open: m.checked,
    ref: d,
    onComplete() {
      m.checked || b(!1);
    }
  });
  const x = {
    checked: m.checked,
    disabled: m.disabled,
    highlighted: m.highlighted,
    transitionStatus: v
  };
  return nt("span", o, {
    state: x,
    ref: [a, d],
    stateAttributesMapping: Ex,
    props: {
      "aria-hidden": !0,
      ...g
    },
    enabled: p || m.checked
  });
}), Tx = /* @__PURE__ */ y.createContext(void 0);
function YO() {
  const n = y.useContext(Tx);
  if (n === void 0)
    throw new Error(Mt(31));
  return n;
}
const GO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
  return /* @__PURE__ */ S.jsx(Tx.Provider, {
    value: m,
    children: d
  });
}), qO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    id: p,
    ...g
  } = o, m = Bn(p), d = YO();
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
}), XO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    id: f,
    label: p,
    nativeButton: g = !1,
    disabled: m = !1,
    closeOnClick: d = !0,
    style: v,
    ...b
  } = o, x = Ci({
    label: p
  }), R = oc(!0), w = Bn(f), {
    store: D
  } = ml(), T = D.useState("isActive", x.index), N = D.useState("itemProps"), {
    getItemProps: A,
    itemRef: E
  } = eg({
    closeOnClick: d,
    disabled: m,
    highlighted: T,
    id: w,
    store: D,
    nativeButton: g,
    nodeId: R?.context.nodeId,
    itemMetadata: xx
  });
  return nt("div", o, {
    state: {
      disabled: m,
      highlighted: T
    },
    props: [N, b, A],
    ref: [E, a, x.ref]
  });
}), FO = /* @__PURE__ */ y.createContext(void 0);
function ac(n) {
  return y.useContext(FO);
}
function Oi(n) {
  return n === "starting" ? jR : bt;
}
const KO = {
  ...ko,
  ...jo
}, QO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    finalFocus: p,
    ...g
  } = o, {
    store: m
  } = ml(), {
    side: d,
    align: v
  } = oc(), b = ac() != null, x = m.useState("open"), R = m.useState("transitionStatus"), w = m.useState("popupProps"), D = m.useState("mounted"), T = m.useState("instantType"), N = m.useState("activeTriggerElement"), A = m.useState("parent"), E = m.useState("lastOpenChangeReason"), z = m.useState("rootId"), U = m.useState("floatingRootContext"), j = m.useState("floatingTreeRoot"), O = m.useState("closeDelay"), k = m.useState("activeTriggerElement"), G = m.useState("hoverEnabled"), P = m.useState("disabled"), ne = m.useState("openMethod"), K = A.type === "context-menu";
  Ql({
    open: x,
    ref: m.context.popupRef,
    onComplete() {
      x && m.context.onOpenChangeComplete?.(!0);
    }
  }), y.useEffect(() => {
    function Y(B) {
      m.setOpen(!1, Ye(B.reason, B.domEvent));
    }
    return j.events.on("close", Y), () => {
      j.events.off("close", Y);
    };
  }, [j.events, m]), $p(U, {
    enabled: G && !P && !K && A.type !== "menubar",
    closeDelay: O
  });
  const Q = y.useCallback((Y) => {
    m.set("popupElement", Y);
  }, [m]), Z = {
    transitionStatus: R,
    side: d,
    align: v,
    open: x,
    nested: A.type === "menu",
    instant: T
  }, q = nt("div", o, {
    state: Z,
    ref: [a, m.context.popupRef, Q],
    stateAttributesMapping: KO,
    props: [w, {
      onKeyDown(Y) {
        b && Ri.has(Y.key) && Y.stopPropagation();
      }
    }, Oi(R), g, {
      "data-rootownerid": z
    }]
  });
  let _ = A.type === void 0 || K;
  return (N || A.type === "menubar" && E !== _u) && (_ = !0), /* @__PURE__ */ S.jsx(Iu, {
    context: U,
    openInteractionType: ne,
    modal: K,
    disabled: !D,
    returnFocus: p === void 0 ? _ : p,
    initialFocus: A.type !== "menu",
    restoreFocus: !0,
    externalTree: A.type !== "menubar" ? j : void 0,
    previousFocusableElement: k,
    nextFocusableElement: A.type === void 0 ? m.context.triggerFocusTargetRef : void 0,
    beforeContentFocusGuardRef: A.type === void 0 ? m.context.beforeContentFocusGuardRef : void 0,
    children: q
  });
}), Rx = /* @__PURE__ */ y.createContext(void 0);
function ZO() {
  const n = y.useContext(Rx);
  if (n === void 0)
    throw new Error(Mt(32));
  return n;
}
const JO = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = o, {
    store: f
  } = ml();
  return f.useState("mounted") || i ? /* @__PURE__ */ S.jsx(Rx.Provider, {
    value: i,
    children: /* @__PURE__ */ S.jsx(Lu, {
      ref: a,
      ...c
    })
  }) : null;
}), $O = /* @__PURE__ */ y.createContext(void 0);
function ic() {
  return y.useContext($O)?.direction ?? "ltr";
}
const WO = (n) => ({
  name: "arrow",
  options: n,
  async fn(o) {
    const {
      x: a,
      y: i,
      placement: c,
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
    const x = c0(v), R = {
      x: a,
      y: i
    }, w = kp(c), D = jp(w), T = await p.getDimensions(d), N = w === "y", A = N ? "top" : "left", E = N ? "bottom" : "right", z = N ? "clientHeight" : "clientWidth", U = f.reference[D] + f.reference[w] - R[w] - f.floating[D], j = R[w] - f.reference[w], O = b === "real" ? await p.getOffsetParent?.(d) : g.floating;
    let k = g.floating[z] || f.floating[D];
    (!k || !await p.isElement?.(O)) && (k = g.floating[z] || f.floating[D]);
    const G = U / 2 - j / 2, P = k / 2 - T[D] / 2 - 1, ne = Math.min(x[A], P), K = Math.min(x[E], P), Q = ne, Z = k - T[D] - K, q = k / 2 - T[D] / 2 + G, _ = u0(Q, q, Z), Y = !m.arrow && Do(c) != null && q !== _ && f.reference[D] / 2 - (q < Q ? ne : K) - T[D] / 2 < 0, B = Y ? q < Q ? q - Q : q - Z : 0;
    return {
      [w]: R[w] + B,
      data: {
        [w]: _,
        centerOffset: q - _ - B,
        ...Y && {
          alignmentOffset: B
        }
      },
      reset: Y
    };
  }
}), eM = (n, o) => ({
  ...WO(n),
  options: [n, o]
}), tM = MC().fn, nM = {
  name: "hide",
  async fn(n) {
    const {
      width: o,
      height: a,
      x: i,
      y: c
    } = n.rects.reference, f = o === 0 && a === 0 && i === 0 && c === 0;
    return {
      data: {
        referenceHidden: (await tM(n)).data?.referenceHidden || f
      }
    };
  }
}, su = {
  sideX: "left",
  sideY: "top"
}, tg = {
  name: "adaptiveOrigin",
  async fn(n) {
    const {
      x: o,
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
    } = n, m = zt(c), d = m.getComputedStyle(c);
    if (!(d.transitionDuration !== "0s" && d.transitionDuration !== ""))
      return {
        x: o,
        y: a,
        data: su
      };
    const b = await f.getOffsetParent?.(c);
    let x = {
      width: 0,
      height: 0
    };
    if (p === "fixed" && m?.visualViewport)
      x = {
        width: m.visualViewport.width,
        height: m.visualViewport.height
      };
    else if (b === m) {
      const A = tt(c);
      x = {
        width: A.documentElement.clientWidth,
        height: A.documentElement.clientHeight
      };
    } else await f.isElement?.(b) && (x = await f.getDimensions(b));
    const R = Ln(g);
    let w = o, D = a;
    R === "left" && (w = x.width - (o + i.width)), R === "top" && (D = x.height - (a + i.height));
    const T = R === "left" ? "right" : su.sideX, N = R === "top" ? "bottom" : su.sideY;
    return {
      x: w,
      y: D,
      data: {
        sideX: T,
        sideY: N
      }
    };
  }
};
function Cx(n, o, a) {
  const i = n === "inline-start" || n === "inline-end";
  return {
    top: "top",
    right: i ? a ? "inline-start" : "inline-end" : "right",
    bottom: "bottom",
    left: i ? a ? "inline-end" : "inline-start" : "left"
  }[o];
}
function ib(n, o, a) {
  const {
    rects: i,
    placement: c
  } = n;
  return {
    side: Cx(o, Ln(c), a),
    align: Do(c) || "center",
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
function sc(n) {
  const {
    // Public parameters
    anchor: o,
    positionMethod: a = "absolute",
    side: i = "bottom",
    sideOffset: c = 0,
    align: f = "center",
    alignOffset: p = 0,
    collisionBoundary: g,
    collisionPadding: m = 5,
    sticky: d = !1,
    arrowPadding: v = 5,
    disableAnchorTracking: b = !1,
    inline: x,
    // Private parameters
    keepMounted: R = !1,
    floatingRootContext: w,
    mounted: D,
    collisionAvoidance: T,
    shiftCrossAxis: N = !1,
    nodeId: A,
    adaptiveOrigin: E,
    lazyFlip: z = !1,
    externalTree: U
  } = n, [j, O] = y.useState(null);
  !D && j !== null && O(null);
  const k = T.side || "flip", G = T.align || "flip", P = T.fallbackAxisSide || "end", ne = typeof o == "function" ? o : void 0, K = ze(ne), Q = ne ? K : o, Z = Yt(o), q = Yt(D), Y = ic() === "rtl", B = j || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": Y ? "left" : "right",
    "inline-start": Y ? "right" : "left"
  }[i], F = f === "center" ? B : `${B}-${f}`;
  let I = m;
  const M = 1, H = i === "bottom" ? M : 0, te = i === "top" ? M : 0, J = i === "right" ? M : 0, re = i === "left" ? M : 0;
  typeof I == "number" ? I = {
    top: I + H,
    right: I + re,
    bottom: I + te,
    left: I + J
  } : I && (I = {
    top: (I.top || 0) + H,
    right: (I.right || 0) + re,
    bottom: (I.bottom || 0) + te,
    left: (I.left || 0) + J
  });
  const ie = {
    boundary: g === "clipping-ancestors" ? "clippingAncestors" : g,
    padding: I
  }, oe = y.useRef(null), se = Yt(c), ge = Yt(p), je = typeof c != "function" ? c : 0, Ee = typeof p != "function" ? p : 0, fe = [];
  x && fe.push(x), fe.push(EC((Qe) => {
    const ft = ib(Qe, i, Y), It = typeof se.current == "function" ? se.current(ft) : se.current, Ht = typeof ge.current == "function" ? ge.current(ft) : ge.current;
    return {
      mainAxis: It,
      crossAxis: Ht,
      alignmentAxis: Ht
    };
  }, [je, Ee, Y, i]));
  const ye = G === "none" && k !== "shift", Re = !ye && (d || N || k === "shift"), _e = k === "none" ? null : CC({
    ...ie,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: I.top + M,
      right: I.right + M,
      bottom: I.bottom + M,
      left: I.left + M
    },
    mainAxis: !N && k === "flip",
    crossAxis: G === "flip" ? "alignment" : !1,
    fallbackAxisSideDirection: P
  }), ke = ye ? null : TC((Qe) => {
    const ft = tt(Qe.elements.floating).documentElement;
    return {
      ...ie,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: N ? {
        x: 0,
        y: 0,
        width: ft.clientWidth,
        height: ft.clientHeight
      } : void 0,
      mainAxis: G !== "none",
      crossAxis: Re,
      limiter: d || N ? void 0 : RC((It) => {
        if (!oe.current)
          return {};
        const {
          width: Ht,
          height: Ut
        } = oe.current.getBoundingClientRect(), Nt = Wn(Ln(It.placement)), Gt = Nt === "y" ? Ht : Ut, Sn = Nt === "y" ? I.left + I.right : I.top + I.bottom;
        return {
          offset: Gt / 2 + Sn / 2
        };
      })
    };
  }, [ie, d, N, I, G]);
  k === "shift" || G === "shift" || f === "center" ? fe.push(ke, _e) : fe.push(_e, ke), fe.push(OC({
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
      const Nt = zt(Qe).devicePixelRatio || 1, {
        x: Gt,
        y: Sn,
        width: zn,
        height: Vn
      } = Ht.reference, qt = (Math.round((Gt + zn) * Nt) - Math.round(Gt * Nt)) / Nt, Pn = (Math.round((Sn + Vn) * Nt) - Math.round(Sn * Nt)) / Nt;
      Ut.setProperty("--anchor-width", `${qt}px`), Ut.setProperty("--anchor-height", `${Pn}px`);
    }
  }), eM((Qe) => ({
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
        y: Nt
      } = Qe, Gt = Ln(Ht), Sn = Wn(Gt), zn = oe.current, Vn = It.arrow?.x || 0, qt = It.arrow?.y || 0, Pn = zn?.clientWidth || 0, hl = zn?.clientHeight || 0, tl = Vn + Pn / 2, yl = qt + hl / 2, qe = Math.abs(It.shift?.y || 0), xt = Ut.reference.height / 2, Xt = typeof c == "function" ? c(ib(Qe, i, Y)) : c, nn = qe > Xt, Wt = {
        top: `${tl}px calc(100% + ${Xt}px)`,
        bottom: `${tl}px ${-Xt}px`,
        left: `calc(100% + ${Xt}px) ${yl}px`,
        right: `${-Xt}px ${yl}px`
      }[Gt], Ct = `${tl}px ${Ut.reference.y + xt - Nt}px`;
      return ft.floating.style.setProperty("--transform-origin", Re && Sn === "y" && nn ? Ct : Wt), {};
    }
  }, nM, E), xe(() => {
    !D && w && w.update({
      referenceElement: null,
      floatingElement: null,
      domReferenceElement: null,
      positionReference: null
    });
  }, [D, w]);
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
  } = FC({
    rootContext: w,
    open: R ? D : void 0,
    placement: F,
    middleware: fe,
    strategy: a,
    whileElementsMounted: R ? void 0 : (...Qe) => Qv(...Qe, we),
    nodeId: A,
    externalTree: U
  }), {
    sideX: be,
    sideY: We
  } = Oe.adaptiveOrigin || su, rt = Ue ? a : "fixed", pt = y.useMemo(() => {
    const Qe = E ? {
      position: rt,
      [be]: Se,
      [We]: Te
    } : {
      position: rt,
      ...ve
    };
    return Ue || (Qe.opacity = 0), Qe;
  }, [E, rt, be, Se, We, Te, ve, Ue]), Dt = y.useRef(null);
  xe(() => {
    if (!D)
      return;
    const Qe = Z.current, ft = typeof Qe == "function" ? Qe() : Qe, Ht = (sb(ft) ? ft.current : ft) || null || null;
    Ht !== Dt.current && (Ce.setPositionReference(Ht), Dt.current = Ht);
  }, [D, Ce, Q, Z]), y.useEffect(() => {
    if (!D)
      return;
    const Qe = Z.current;
    typeof Qe != "function" && sb(Qe) && Qe.current !== Dt.current && (Ce.setPositionReference(Qe.current), Dt.current = Qe.current);
  }, [D, Ce, Q, Z]), y.useEffect(() => {
    if (R && D && he.reference && he.floating)
      return Qv(he.reference, he.floating, He, we);
  }, [R, D, he, He, we]);
  const et = Ln(ae), gt = Cx(i, et, Y), At = Do(ae) || "center", mt = !!Oe.hide?.referenceHidden;
  xe(() => {
    z && D && Ue && O(et);
  }, [z, D, Ue, et]);
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
    align: At,
    physicalSide: et,
    anchorHidden: mt,
    refs: Ce,
    context: pe,
    isPositioned: Ue,
    update: He
  }), [pt, Mn, oe, An, gt, At, et, mt, Ce, pe, Ue, He]);
}
function sb(n) {
  return n != null && "current" in n;
}
function ng(n) {
  const {
    children: o,
    elementsRef: a,
    labelsRef: i,
    onMapChange: c
  } = n, f = ze(c), p = y.useRef(0), g = xn(oM).current, m = xn(lM).current, [d, v] = y.useState(0), b = y.useRef(d), x = ze((N, A) => {
    m.set(N, A ?? null), b.current += 1, v(b.current);
  }), R = ze((N) => {
    m.delete(N), b.current += 1, v(b.current);
  }), w = y.useMemo(() => {
    const N = /* @__PURE__ */ new Map();
    return Array.from(m.keys()).filter((E) => E.isConnected).sort(rM).forEach((E, z) => {
      const U = m.get(E) ?? {};
      N.set(E, {
        ...U,
        index: z
      });
    }), N;
  }, [m, d]);
  xe(() => {
    if (typeof MutationObserver != "function" || w.size === 0)
      return;
    const N = new MutationObserver((A) => {
      const E = /* @__PURE__ */ new Set(), z = (U) => E.has(U) ? E.delete(U) : E.add(U);
      A.forEach((U) => {
        U.removedNodes.forEach(z), U.addedNodes.forEach(z);
      }), E.size === 0 && (b.current += 1, v(b.current));
    });
    return w.forEach((A, E) => {
      E.parentElement && N.observe(E.parentElement, {
        childList: !0
      });
    }), () => {
      N.disconnect();
    };
  }, [w]), xe(() => {
    b.current === d && (a.current.length !== w.size && (a.current.length = w.size), i && i.current.length !== w.size && (i.current.length = w.size), p.current = w.size), f(w);
  }, [f, w, a, i, d]), xe(() => () => {
    a.current = [];
  }, [a]), xe(() => () => {
    i && (i.current = []);
  }, [i]);
  const D = ze((N) => (g.add(N), () => {
    g.delete(N);
  }));
  xe(() => {
    g.forEach((N) => N(w));
  }, [g, w]);
  const T = y.useMemo(() => ({
    register: x,
    unregister: R,
    subscribeMapChange: D,
    elementsRef: a,
    labelsRef: i,
    nextIndexRef: p
  }), [x, R, D, a, i, p]);
  return /* @__PURE__ */ S.jsx(Sx.Provider, {
    value: T,
    children: o
  });
}
function lM() {
  return /* @__PURE__ */ new Map();
}
function oM() {
  return /* @__PURE__ */ new Set();
}
function rM(n, o) {
  const a = n.compareDocumentPosition(o);
  return a & Node.DOCUMENT_POSITION_FOLLOWING || a & Node.DOCUMENT_POSITION_CONTAINED_BY ? -1 : a & Node.DOCUMENT_POSITION_PRECEDING || a & Node.DOCUMENT_POSITION_CONTAINS ? 1 : 0;
}
function uc(n, o, {
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
  return g && (m.pointerEvents = "none"), nt("div", n, {
    state: o,
    ref: f,
    props: [{
      role: "presentation",
      hidden: p,
      style: m
    }, Oi(i), c],
    stateAttributesMapping: ko
  });
}
const aM = 20;
function lg(n, o, a, i) {
  const [c, f] = y.useState(!1);
  xe(() => {
    if (!n || !o || a == null) {
      f(!1);
      return;
    }
    const p = tt(a).documentElement.clientWidth, g = a.offsetWidth;
    f(p > 0 && g > 0 && g >= p - aM);
  }, [n, o, a]), Wb(n && (!o || c), i);
}
const iM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: c = "absolute",
    className: f,
    render: p,
    side: g,
    align: m,
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: x = 5,
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: D = !1,
    collisionAvoidance: T = T0,
    style: N,
    ...A
  } = o, {
    store: E
  } = ml(), z = ZO(), U = rc(!0), j = E.useState("parent"), O = E.useState("floatingRootContext"), k = E.useState("floatingTreeRoot"), G = E.useState("mounted"), P = E.useState("open"), ne = E.useState("modal"), K = E.useState("openMethod"), Q = E.useState("activeTriggerElement"), Z = E.useState("transitionStatus"), q = E.useState("positionerElement"), _ = E.useState("instantType"), Y = E.useState("hasViewport"), B = E.useState("lastOpenChangeReason"), F = E.useState("floatingNodeId"), I = E.useState("floatingParentNodeId"), M = O.useState("domReferenceElement"), H = y.useRef(null), te = Yp(q, !1, !1);
  let J = i, re = d, ie = v, oe = m, se = T;
  j.type === "context-menu" && (J = i ?? j.context?.anchor, oe = oe ?? "start", !g && oe !== "center" && (ie = o.alignOffset ?? 2, re = o.sideOffset ?? -5));
  let ge = g, je = oe;
  j.type === "menu" ? (ge = ge ?? "inline-end", je = je ?? "start", se = o.collisionAvoidance ?? Up) : j.type === "menubar" && (ge = ge ?? (j.context.orientation === "vertical" ? "inline-end" : "bottom"), je = je ?? "start");
  const Ee = j.type === "context-menu", fe = sc({
    anchor: J,
    floatingRootContext: O,
    positionMethod: U ? "fixed" : c,
    mounted: G,
    side: ge,
    sideOffset: re,
    align: je,
    alignOffset: ie,
    arrowPadding: Ee ? 0 : R,
    collisionBoundary: b,
    collisionPadding: x,
    sticky: w,
    nodeId: F,
    keepMounted: z,
    disableAnchorTracking: D,
    collisionAvoidance: se,
    shiftCrossAxis: Ee && !("side" in se && se.side === "flip"),
    externalTree: k,
    adaptiveOrigin: Y ? tg : void 0
  });
  y.useEffect(() => {
    function Se(Te) {
      Te.open && (Te.parentNodeId === F && E.set("hoverEnabled", !1), Te.nodeId !== F && Te.parentNodeId === E.select("floatingParentNodeId") && E.setOpen(!1, Ye(ri)));
    }
    return k.events.on("menuopenchange", Se), () => {
      k.events.off("menuopenchange", Se);
    };
  }, [E, k.events, F]), y.useEffect(() => {
    if (E.select("floatingParentNodeId") == null)
      return;
    function Se(Te) {
      if (Te.open || Te.nodeId !== E.select("floatingParentNodeId"))
        return;
      const Oe = Te.reason ?? ri;
      E.setOpen(!1, Ye(Oe));
    }
    return k.events.on("menuopenchange", Se), () => {
      k.events.off("menuopenchange", Se);
    };
  }, [k.events, E]);
  const ye = an();
  y.useEffect(() => {
    P || ye.clear();
  }, [P, ye]), y.useEffect(() => {
    function Se(Te) {
      if (!(!P || Te.nodeId !== E.select("floatingParentNodeId")))
        if (Te.target && Q && Q !== Te.target) {
          const Oe = E.select("closeDelay");
          Oe > 0 ? ye.isStarted() || ye.start(Oe, () => {
            E.setOpen(!1, Ye(ri));
          }) : E.setOpen(!1, Ye(ri));
        } else
          ye.clear();
    }
    return k.events.on("itemhover", Se), () => {
      k.events.off("itemhover", Se);
    };
  }, [k.events, P, Q, E, ye]), y.useEffect(() => {
    const Se = {
      open: P,
      nodeId: F,
      parentNodeId: I,
      reason: E.select("lastOpenChangeReason")
    };
    k.events.emit("menuopenchange", Se);
  }, [k.events, P, E, F, I]), xe(() => {
    const Se = M, Te = H.current;
    if (Se && (H.current = Se), Te && Se && Se !== Te) {
      E.set("instantType", void 0);
      const Oe = new AbortController();
      return te(() => {
        E.set("instantType", "trigger-change");
      }, Oe.signal), () => {
        Oe.abort();
      };
    }
  }, [M, te, E]);
  const Re = {
    open: P,
    side: fe.side,
    align: fe.align,
    anchorHidden: fe.anchorHidden,
    nested: j.type === "menu",
    instant: _
  }, _e = j.type === "menubar" && j.context.modal;
  lg(P && (_e || ne && B !== Pt), K === "touch", q, Q);
  const we = uc(o, Re, {
    styles: fe.positionerStyles,
    transitionStatus: Z,
    props: A,
    refs: [a, E.useStateSetter("positionerElement")],
    hidden: !G,
    inert: !P
  }), Ce = G && j.type !== "menu" && (j.type !== "menubar" && ne && B !== Pt || j.type === "menubar" && j.context.modal);
  let he = null;
  return j.type === "menubar" ? he = j.context.contentElement : j.type === void 0 && (he = Q), /* @__PURE__ */ S.jsxs(yx.Provider, {
    value: fe,
    children: [Ce && /* @__PURE__ */ S.jsx(lc, {
      ref: j.type === "context-menu" || j.type === "nested-context-menu" ? j.context.internalBackdropRef : null,
      inert: nc(!P),
      cutout: he
    }), /* @__PURE__ */ S.jsx(D0, {
      id: F,
      children: /* @__PURE__ */ S.jsx(ng, {
        elementsRef: E.context.itemDomElements,
        labelsRef: E.context.itemLabels,
        children: we
      })
    })]
  });
}), sM = /* @__PURE__ */ y.createContext(null);
function Ox(n) {
  return y.useContext(sM);
}
const uM = {
  ...Qu,
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
class og extends Ti {
  constructor(o) {
    super({
      ...cM(),
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
    }, uM), this.unsubscribeParentListener = this.observe("parent", (a) => {
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
  setOpen(o, a) {
    this.state.floatingRootContext.context.events.emit("setOpen", {
      open: o,
      eventDetails: a
    });
  }
  static useStore(o, a) {
    const i = xn(() => new og(a)).current;
    return o ?? i;
  }
  unsubscribeParentListener = null;
}
function cM() {
  return {
    ...Ku(),
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
    floatingTreeRoot: new Lp(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: bt,
    keyboardEventRelay: void 0,
    closeDelay: 0,
    hasViewport: !1
  };
}
const Mx = /* @__PURE__ */ y.createContext(void 0);
function Ax() {
  return y.useContext(Mx);
}
const zx = Pp(function(o) {
  const {
    children: a,
    open: i,
    onOpenChange: c,
    onOpenChangeComplete: f,
    defaultOpen: p = !1,
    disabled: g = !1,
    modal: m,
    loopFocus: d = !0,
    orientation: v = "vertical",
    actionsRef: b,
    closeParentOnEsc: x = !1,
    handle: R,
    triggerId: w,
    defaultTriggerId: D = null,
    highlightItemOnHover: T = !0
  } = o, N = rc(!0), A = ml(!0), E = Ox(!0), z = Ax(), U = y.useMemo(() => z && A ? {
    type: "menu",
    store: A.store
  } : E ? {
    type: "menubar",
    context: E
  } : N && !A ? {
    type: "context-menu",
    context: N
  } : {
    type: void 0
  }, [N, A, E, z]), j = og.useStore(R?.store, {
    open: p,
    openProp: i,
    activeTriggerId: D,
    triggerIdProp: w,
    parent: U
  });
  Xp(j, i, p, D), j.useControlledProp("openProp", i), j.useControlledProp("triggerIdProp", w), j.useContextCallback("onOpenChangeComplete", f);
  const O = rr(), k = rr(), G = j.useState("floatingTreeRoot"), P = Ip(G), ne = Kl(), K = j.useState("open"), Q = j.useState("activeTriggerElement"), Z = j.useState("positionerElement"), q = j.useState("hoverEnabled"), _ = j.useState("disabled"), Y = j.useState("lastOpenChangeReason"), B = j.useState("parent"), F = j.useState("activeIndex"), I = j.useState("payload"), M = j.useState("floatingParentNodeId"), H = y.useRef(null), te = y.useRef(B.type !== "context-menu"), J = an(), re = y.useRef(!0), ie = an(), oe = M != null, {
    openMethod: se,
    triggerProps: ge
  } = hx(K);
  j.useSyncedValues({
    disabled: g,
    highlightItemOnHover: T,
    modal: B.type === void 0 ? m : void 0,
    openMethod: se,
    rootId: O
  }), qu(j);
  const {
    forceUnmount: je
  } = Xu(K, j, () => {
    j.update({
      allowMouseEnter: !1,
      stickIfOpen: !0
    });
  });
  xe(() => {
    N && !A ? j.update({
      parent: {
        type: "context-menu",
        context: N
      },
      floatingNodeId: P,
      floatingParentNodeId: ne
    }) : A && j.update({
      floatingNodeId: P,
      floatingParentNodeId: ne
    });
  }, [N, A, P, ne, j]), y.useEffect(() => {
    if (K || (H.current = null), B.type === "context-menu") {
      if (!K) {
        J.clear(), te.current = !1;
        return;
      }
      J.start(500, () => {
        te.current = !0;
      });
    }
  }, [J, K, B.type]), xe(() => {
    !K && !q && j.set("hoverEnabled", !0);
  }, [K, q, j]);
  const Ee = ze((be, We) => {
    const rt = We.reason;
    if (K === be && We.trigger === Q && Y === rt)
      return;
    const pt = qp(We);
    if (!be && We.trigger == null && (We.trigger = Q ?? void 0), c?.(be, We), We.isCanceled)
      return;
    j.state.floatingRootContext.dispatchOpenChange(be, We);
    const Dt = We.event;
    if (be === !1 && Dt?.type === "click" && Dt.pointerType === "touch" && !re.current)
      return;
    be && rt === Jr ? (re.current = !1, ie.start(300, () => {
      re.current = !0;
    })) : (re.current = !0, ie.clear());
    const et = (rt === ql || rt === $r) && Dt.detail === 0 && Dt?.isTrusted, gt = !be && (rt === Si || rt == null), At = {
      open: be,
      openChangeReason: rt
    };
    H.current = We.event ?? null, Gu(At, be, We.trigger, pt()), j.update(At), B.type === "menubar" && (rt === Jr || rt === To || rt === Pt || rt === lp || rt === ri) ? j.set("instantType", "group") : et || gt ? j.set("instantType", et ? "click" : "dismiss") : j.set("instantType", void 0);
  }), fe = q0({
    popupStore: j,
    floatingId: k,
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
    j.setOpen(!1, Ye(Hu));
  }, [j]);
  y.useImperativeHandle(b, () => ({
    unmount: je,
    close: Re
  }), [je, Re]);
  let _e;
  B.type === "context-menu" && (_e = B.context), y.useImperativeHandle(_e?.positionerRef, () => Z, [Z]), y.useImperativeHandle(_e?.actionsRef, () => ({
    setOpen: Ee
  }), [Ee]);
  const ke = Ei(fe, {
    enabled: !_,
    bubbles: {
      escapeKey: x && B.type === "menu"
    },
    outsidePress() {
      return B.type !== "context-menu" || H.current?.type === "contextmenu" ? !0 : te.current;
    },
    externalTree: oe ? G : void 0
  }), we = ic(), Ce = y.useCallback((be) => {
    j.select("activeIndex") !== be && j.set("activeIndex", be);
  }, [j]), he = W0(fe, {
    enabled: !_,
    listRef: j.context.itemDomElements,
    activeIndex: F,
    nested: B.type !== void 0,
    loopFocus: d,
    orientation: v,
    parentOrientation: B.type === "menubar" ? B.context.orientation : void 0,
    rtl: we === "rtl",
    disabledIndices: Gl,
    onNavigate: Ce,
    openOnArrowKeyDown: B.type !== "context-menu",
    externalTree: oe ? G : void 0,
    focusItemOnHover: T
  }), Se = y.useCallback((be) => {
    j.context.typingRef.current = be;
  }, [j]), Te = ex(fe, {
    enabled: !_,
    listRef: j.context.itemLabels,
    elementsRef: j.context.itemDomElements,
    activeIndex: F,
    resetMs: NR,
    onMatch: (be) => {
      K && be !== F && j.set("activeIndex", be);
    },
    onTyping: Se
  }), Oe = y.useMemo(() => {
    const be = bn(Te.reference, he.reference, ke.reference, {
      onMouseMove() {
        j.set("allowMouseEnter", !0);
      }
    }, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = K, be;
  }, [j, Te.reference, he.reference, ke.reference, ge, K]), He = y.useMemo(() => {
    const be = bn(he.trigger, ke.trigger, ge);
    return be["aria-haspopup"] = "menu", be["aria-expanded"] = !1, be;
  }, [he.trigger, ke.trigger, ge]), ae = y.useMemo(() => bn(ia, {
    id: k,
    role: "menu",
    "aria-labelledby": Q?.id,
    onMouseMove() {
      j.set("allowMouseEnter", !0), B.type === "menu" && j.set("hoverEnabled", !1);
    },
    onClick() {
      j.select("hoverEnabled") && j.set("hoverEnabled", !1);
    },
    onKeyDown(be) {
      const We = j.select("keyboardEventRelay");
      We && !be.isPropagationStopped() && We(be);
    }
  }, Te.floating, he.floating, ke.floating), [Q, k, B.type, j, Te.floating, he.floating, ke.floating]), pe = he.item ?? bt;
  Fu(j, {
    floatingRootContext: fe,
    activeTriggerProps: Oe,
    inactiveTriggerProps: He,
    popupProps: ae,
    itemProps: pe
  });
  const Ue = y.useMemo(() => ({
    store: j,
    parent: U
  }), [j, U]), ve = /* @__PURE__ */ S.jsx(vx.Provider, {
    value: Ue,
    children: typeof a == "function" ? a({
      payload: I
    }) : a
  });
  return B.type === void 0 || B.type === "context-menu" ? /* @__PURE__ */ S.jsx(N0, {
    externalTree: G,
    children: ve
  }) : ve;
});
function fM(n) {
  const o = ml().store, a = y.useMemo(() => ({
    parentMenu: o
  }), [o]);
  return /* @__PURE__ */ S.jsx(Mx.Provider, {
    value: a,
    children: /* @__PURE__ */ S.jsx(zx, {
      ...n
    })
  });
}
function Dx(n) {
  const o = n.getBoundingClientRect(), a = zt(n);
  if (Mp)
    return o;
  const i = a.getComputedStyle(n, "::before"), c = a.getComputedStyle(n, "::after");
  if (!(i.content !== "none" || c.content !== "none"))
    return o;
  const p = parseFloat(i.width) || 0, g = parseFloat(i.height) || 0, m = parseFloat(c.width) || 0, d = parseFloat(c.height) || 0, v = Math.max(o.width, p, m), b = Math.max(o.height, g, d), x = v - o.width, R = b - o.height;
  return {
    left: o.left - x / 2,
    right: o.right + x / 2,
    top: o.top - R / 2,
    bottom: o.bottom + R / 2
  };
}
function dM(n = {}) {
  const {
    highlightItemOnHover: o,
    highlightedIndex: a,
    onHighlightedIndexChange: i
  } = wp(), {
    ref: c,
    index: f
  } = Ci(n), p = a === f, g = y.useRef(null), m = Eo(c, g);
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
function Nx(n) {
  const {
    render: o,
    className: a,
    style: i,
    state: c = bt,
    props: f = Gl,
    refs: p = Gl,
    metadata: g,
    stateAttributesMapping: m,
    tag: d = "div",
    ...v
  } = n, {
    compositeProps: b,
    compositeRef: x
  } = dM({
    metadata: g
  });
  return nt(d, n, {
    state: c,
    ref: [...p, x],
    props: [b, ...f, v],
    stateAttributesMapping: m
  });
}
function jx(n) {
  if (Rt(n) && n.hasAttribute("data-rootownerid"))
    return n.getAttribute("data-rootownerid") ?? void 0;
  if (!Bl(n))
    return jx(Yl(n));
}
function kx(n, o) {
  const a = y.useRef(null);
  function i(f) {
    gl.flushSync(() => {
      n.setOpen(!1, Ye(To, f.nativeEvent, f.currentTarget));
    }), OR(a.current)?.focus();
  }
  function c(f) {
    const p = n.select("positionerElement");
    if (p && Wr(f, p))
      n.context.beforeContentFocusGuardRef.current?.focus();
    else {
      gl.flushSync(() => {
        n.setOpen(!1, Ye(To, f.nativeEvent, f.currentTarget));
      });
      let g = CR(n.context.triggerFocusTargetRef.current || o.current);
      for (; g !== null && Le(p, g); ) {
        const m = g;
        if (g = Hp(g), g === m)
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
function pM(n) {
  const {
    enabled: o = !0,
    mouseDownAction: a,
    open: i
  } = n, c = y.useRef(!1);
  return y.useMemo(() => o ? {
    onMouseDown: (f) => {
      (a === "open" && !i || a === "close" && i) && (c.current = !0, tt(f.currentTarget).addEventListener("click", () => {
        c.current = !1;
      }, {
        once: !0
      }));
    },
    onClick: (f) => {
      c.current && (c.current = !1, f.preventBaseUIHandler());
    }
  } : bt, [o, a, i]);
}
const Ws = 2, gM = Y0(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    id: m,
    openOnHover: d,
    delay: v = 100,
    closeDelay: b = 0,
    handle: x,
    payload: R,
    ...w
  } = o, D = ml(!0), T = x?.store ?? D?.store;
  if (!T)
    throw new Error(Mt(85));
  const N = Bn(m), A = T.useState("isTriggerActive", N), E = T.useState("floatingRootContext"), z = T.useState("isOpenedByTrigger", N), U = T.useState("triggerPopupId", N), j = y.useRef(null), O = hM(), k = wp(!0), G = No(), P = y.useMemo(() => G ?? new Lp(), [G]), ne = Ip(P), K = Kl(), {
    registerTrigger: Q,
    isMountedByThisTrigger: Z
  } = Fp(N, j, T, {
    payload: R,
    closeDelay: b,
    parent: O,
    floatingTreeRoot: P,
    floatingNodeId: ne,
    floatingParentNodeId: K,
    keyboardEventRelay: k?.relayKeyboardEvent
  }), q = O.type === "menubar", _ = T.useState("disabled"), Y = p || _ || q && O.context.disabled, {
    getButtonProps: B,
    buttonRef: F
  } = Oo({
    disabled: Y,
    native: g
  });
  y.useEffect(() => {
    !z && O.type === void 0 && (T.context.allowMouseUpTriggerRef.current = !1);
  }, [T, z, O.type]);
  const I = y.useRef(null), M = an(), H = ze((he) => {
    if (!I.current)
      return;
    M.clear(), T.context.allowMouseUpTriggerRef.current = !1;
    const Se = he.target;
    if (Le(I.current, Se) || Le(T.select("positionerElement"), Se) || Se === I.current || Se != null && jx(Se) === T.select("rootId"))
      return;
    const Te = Dx(I.current);
    he.clientX >= Te.left - Ws && he.clientX <= Te.right + Ws && he.clientY >= Te.top - Ws && he.clientY <= Te.bottom + Ws || P.events.emit("close", {
      domEvent: he,
      reason: r0
    });
  });
  y.useEffect(() => {
    z && T.select("lastOpenChangeReason") === Pt && tt(I.current).addEventListener("mouseup", H, {
      once: !0
    });
  }, [z, H, T]);
  const te = q && O.context.hasSubmenuOpen, re = Zu(E, {
    enabled: (d ?? te) && !Y && O.type !== "context-menu" && (!q || te && !Z),
    handleClose: $u({
      blockPointerEvents: !q
    }),
    mouseOnly: !0,
    move: !1,
    restMs: O.type === void 0 ? v : void 0,
    delay: {
      close: b
    },
    triggerElementRef: j,
    externalTree: P,
    isActiveTrigger: A,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), ie = mM(z, T.select("lastOpenChangeReason")), oe = Bu(E, {
    enabled: !Y && O.type !== "context-menu",
    event: z && q ? "click" : "mousedown",
    toggle: !0,
    ignoreMouse: !1,
    stickIfOpen: O.type === void 0 ? ie : !1
  }), se = J0(E, {
    enabled: !Y && te
  }), ge = pM({
    open: z,
    enabled: q,
    mouseDownAction: "open"
  }), je = y.useMemo(() => bn(se.reference, oe.reference), [se.reference, oe.reference]), Ee = T.useState("triggerProps", Z), {
    preFocusGuardRef: fe,
    handlePreFocusGuardFocus: ye,
    handleFocusTargetFocus: Re
  } = kx(T, j), _e = {
    disabled: Y,
    open: z
  }, ke = [I, a, F, Q, j], we = [je, re ?? bt, Ee, {
    "aria-haspopup": "menu",
    "aria-controls": U,
    id: N,
    onMouseDown: (he) => {
      if (T.select("open"))
        return;
      M.start(200, () => {
        T.context.allowMouseUpTriggerRef.current = !0;
      }), tt(he.currentTarget).addEventListener("mouseup", H, {
        once: !0
      });
    }
  }, q ? {
    role: "menuitem"
  } : {}, ge, w, B], Ce = nt("button", o, {
    enabled: !q,
    stateAttributesMapping: Eu,
    state: _e,
    ref: ke,
    props: we
  });
  return q ? /* @__PURE__ */ S.jsx(Nx, {
    tag: "button",
    render: i,
    className: c,
    style: f,
    state: _e,
    refs: ke,
    props: we,
    stateAttributesMapping: Eu
  }) : z ? /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ S.jsx(Ro, {
      ref: fe,
      onFocus: ye
    }, `${N}-pre-focus-guard`), /* @__PURE__ */ S.jsx(y.Fragment, {
      children: Ce
    }, N), /* @__PURE__ */ S.jsx(Ro, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: Re
    }, `${N}-post-focus-guard`)]
  }) : /* @__PURE__ */ S.jsx(y.Fragment, {
    children: Ce
  }, N);
});
function mM(n, o) {
  const a = an(), [i, c] = y.useState(!1);
  return xe(() => {
    n && o === "trigger-hover" ? (c(!0), a.start(w0, () => {
      c(!1);
    })) : n || (a.clear(), c(!1));
  }, [n, o, a]), i;
}
function hM() {
  const n = rc(!0), o = ml(!0), a = Ox();
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
function yM(n) {
  const [o, a] = y.useState({
    current: n,
    previous: null
  });
  return n !== o.current && a({
    current: n,
    previous: o.current
  }), o.previous;
}
const _x = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    className: i,
    render: c,
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
function Hx(n) {
  return n == null || n.hasAttribute("disabled") || n.getAttribute("aria-disabled") === "true";
}
const vM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    label: p,
    id: g,
    nativeButton: m = !1,
    openOnHover: d = !0,
    delay: v = 100,
    closeDelay: b = 0,
    disabled: x = !1,
    ...R
  } = o, w = Ci({
    label: p
  }), D = oc(), {
    store: T
  } = ml(), N = Bn(g), A = T.useState("open"), E = T.useState("floatingRootContext"), z = T.useState("floatingTreeRoot"), U = T.useState("triggerPopupId", N), j = F0(N, T), O = y.useCallback((oe) => {
    const se = j(oe);
    return oe !== null && T.select("open") && T.select("activeTriggerId") == null && T.update({
      activeTriggerId: N,
      activeTriggerElement: oe,
      closeDelay: b
    }), se;
  }, [j, b, T, N]), k = y.useRef(null), G = y.useCallback((oe) => {
    k.current = oe, T.set("activeTriggerElement", oe);
  }, [T]), P = Ax();
  if (!P?.parentMenu)
    throw new Error(Mt(37));
  T.useSyncedValue("closeDelay", b);
  const ne = P.parentMenu, K = T.useState("disabled"), Q = ne.useState("disabled"), Z = x || K || Q, q = ne.useState("itemProps"), _ = ne.useState("isActive", w.index), Y = y.useMemo(() => ({
    type: "submenu-trigger",
    setActive() {
      ne.select("highlightItemOnHover") && ne.set("activeIndex", w.index);
    }
  }), [ne, w.index]), {
    getItemProps: B,
    itemRef: F
  } = eg({
    closeOnClick: !1,
    disabled: Z,
    highlighted: _,
    id: N,
    store: T,
    typingRef: ne.context.typingRef,
    nativeButton: m,
    itemMetadata: Y,
    nodeId: D?.context.nodeId
  }), I = T.useState("hoverEnabled"), M = Zu(E, {
    enabled: I && d && !Z,
    handleClose: $u({
      blockPointerEvents: !0
    }),
    mouseOnly: !0,
    move: !0,
    restMs: v,
    delay: {
      open: v,
      close: b
    },
    shouldOpen: v > 0 ? () => ne.select("allowMouseEnter") : void 0,
    triggerElementRef: k,
    externalTree: z,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), te = Bu(E, {
    enabled: !Z,
    event: "mousedown",
    toggle: !d,
    ignoreMouse: d,
    stickIfOpen: !1
  }).reference ?? bt, J = T.useState("triggerProps", !0);
  return delete J.id, nt("div", o, {
    state: {
      disabled: Z,
      highlighted: _,
      open: A
    },
    stateAttributesMapping: Wu,
    props: [te, M, J, q, {
      "aria-controls": U,
      tabIndex: A || _ ? 0 : -1,
      onBlur() {
        _ && ne.set("activeIndex", null);
      }
    }, R, B],
    ref: [a, w.ref, F, O, G]
  });
});
function Yd({ ...n }) {
  return /* @__PURE__ */ S.jsx(zx, { "data-slot": "dropdown-menu", ...n });
}
function Gd({ ...n }) {
  return /* @__PURE__ */ S.jsx(gM, { "data-slot": "dropdown-menu-trigger", ...n });
}
function uu({
  align: n = "start",
  alignOffset: o = 0,
  side: a = "bottom",
  sideOffset: i = 4,
  className: c,
  ...f
}) {
  return /* @__PURE__ */ S.jsx(JO, { children: /* @__PURE__ */ S.jsx(
    iM,
    {
      className: "tw:isolate tw:z-[var(--z-popover)] tw:outline-none",
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      children: /* @__PURE__ */ S.jsx(
        QO,
        {
          "data-slot": "dropdown-menu-content",
          className: Ke("tw:max-h-(--available-height) tw:w-(--anchor-width) tw:min-w-32 tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:outline-none", c),
          ...f
        }
      )
    }
  ) });
}
function er({ ...n }) {
  return /* @__PURE__ */ S.jsx(GO, { "data-slot": "dropdown-menu-group", ...n });
}
function bM({
  className: n,
  inset: o,
  ...a
}) {
  return /* @__PURE__ */ S.jsx(
    qO,
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
  return /* @__PURE__ */ S.jsx(
    XO,
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
function xM({ ...n }) {
  return /* @__PURE__ */ S.jsx(fM, { "data-slot": "dropdown-menu-sub", ...n });
}
function SM({
  className: n,
  inset: o,
  children: a,
  ...i
}) {
  return /* @__PURE__ */ S.jsxs(
    vM,
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
        /* @__PURE__ */ S.jsx(F1, { className: "tw:ml-auto" })
      ]
    }
  );
}
function wM({
  align: n = "start",
  alignOffset: o = -3,
  side: a = "right",
  sideOffset: i = 0,
  className: c,
  ...f
}) {
  return /* @__PURE__ */ S.jsx(
    uu,
    {
      "data-slot": "dropdown-menu-sub-content",
      className: Ke("tw:w-auto tw:min-w-[96px] tw:rounded-[var(--radius-control)] tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-lg tw:ring-1 tw:ring-foreground/10", c),
      align: n,
      alignOffset: o,
      side: a,
      sideOffset: i,
      ...f
    }
  );
}
function EM({
  className: n,
  children: o,
  checked: a,
  inset: i,
  ...c
}) {
  return /* @__PURE__ */ S.jsxs(
    VO,
    {
      "data-slot": "dropdown-menu-checkbox-item",
      "data-inset": i,
      className: Ke(
        "tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-1.5 tw:rounded-[var(--radius-control)] tw:py-1 tw:pr-8 tw:pl-1.5 tw:text-[var(--fs-body-s)] tw:outline-hidden tw:select-none tw:focus:bg-accent tw:focus:text-accent-foreground tw:focus:**:text-accent-foreground tw:data-inset:pl-7 tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        n
      ),
      checked: a,
      ...c,
      children: [
        /* @__PURE__ */ S.jsx(
          "span",
          {
            className: "tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:items-center tw:justify-center",
            "data-slot": "dropdown-menu-checkbox-item-indicator",
            children: /* @__PURE__ */ S.jsx(PO, { children: /* @__PURE__ */ S.jsx(
              cu,
              {}
            ) })
          }
        ),
        o
      ]
    }
  );
}
function qd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    _x,
    {
      "data-slot": "dropdown-menu-separator",
      className: Ke("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", n),
      ...o
    }
  );
}
let ub = /* @__PURE__ */ (function(n) {
  return n.disabled = "data-disabled", n.valid = "data-valid", n.invalid = "data-invalid", n.touched = "data-touched", n.dirty = "data-dirty", n.filled = "data-filled", n.focused = "data-focused", n;
})({});
const TM = {
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
}, RM = {
  disabled: !1,
  ...ai
}, Ux = {
  valid(n) {
    return n === null ? null : n ? {
      [ub.valid]: ""
    } : {
      [ub.invalid]: ""
    };
  }
}, CM = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: TM,
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
  state: RM,
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
}, OM = /* @__PURE__ */ y.createContext(CM);
function cc(n = !0) {
  const o = y.useContext(OM);
  if (o.setValidityData === rn && !n)
    throw new Error(Mt(28));
  return o;
}
const MM = /* @__PURE__ */ y.createContext({
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
function Lx() {
  return y.useContext(MM);
}
const AM = /* @__PURE__ */ y.createContext({
  controlId: void 0,
  registerControlId: rn,
  labelId: void 0,
  setLabelId: rn,
  messageIds: [],
  setMessageIds: rn,
  getDescriptionProps: (n) => n
});
function rg() {
  return y.useContext(AM);
}
function ag(n = {}) {
  const {
    id: o,
    implicit: a = !1,
    controlRef: i
  } = n, {
    controlId: c,
    registerControlId: f
  } = rg(), p = Bn(o), g = a ? c : void 0, m = xn(() => /* @__PURE__ */ Symbol("labelable-control")), d = y.useRef(!1), v = y.useRef(o != null), b = ze(() => {
    !d.current || f === rn || (d.current = !1, f(m.current, void 0));
  });
  return xe(() => {
    if (f === rn)
      return;
    let x;
    if (a) {
      const R = i?.current;
      $e(R) && R.closest("label") != null ? x = o ?? null : x = g ?? p;
    } else if (o != null)
      v.current = !0, x = o;
    else if (v.current)
      x = p;
    else {
      b();
      return;
    }
    if (x === void 0) {
      b();
      return;
    }
    d.current = !0, f(m.current, x);
  }, [o, i, g, f, a, p, m, b]), y.useEffect(() => b, [b]), c ?? p;
}
function Ix(n, o, a, i, c = !0, f) {
  const {
    registerFieldControl: p
  } = cc(), g = y.useRef(null);
  g.current || (g.current = /* @__PURE__ */ Symbol()), xe(() => {
    const m = g.current;
    return !m || !c ? void 0 : (p(m, {
      controlRef: n,
      getValue: i,
      id: o,
      name: f,
      value: a
    }), () => {
      p(m, void 0);
    });
  }, [n, c, i, o, f, p, a]);
}
const zM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    id: f,
    name: p,
    value: g,
    disabled: m = !1,
    onValueChange: d,
    defaultValue: v,
    autoFocus: b = !1,
    style: x,
    ...R
  } = o, {
    state: w,
    name: D,
    disabled: T,
    setTouched: N,
    setDirty: A,
    validityData: E,
    setFocused: z,
    setFilled: U,
    validationMode: j,
    validation: O
  } = cc(), {
    clearErrors: k
  } = Lx(), G = T || m, P = D ?? p, ne = {
    ...w,
    disabled: G
  }, {
    labelId: K
  } = rg(), Q = ag({
    id: f
  });
  xe(() => {
    const I = g != null;
    O.inputRef.current?.value || I && g !== "" ? U(!0) : I && g === "" && U(!1);
  }, [O.inputRef, U, g]);
  const Z = y.useRef(null);
  xe(() => {
    b && Z.current === vn(tt(Z.current)) && z(!0);
  }, [b, z]);
  const [q] = ra({
    controlled: g,
    default: v,
    name: "FieldControl",
    state: "value"
  }), _ = g !== void 0, Y = _ ? q : void 0, B = ze(() => O.inputRef.current?.value);
  return Ix(O.inputRef, Q, Y, B, !G, p), nt("input", o, {
    ref: [a, Z],
    state: ne,
    props: [{
      id: Q,
      disabled: G,
      name: P,
      ref: O.inputRef,
      "aria-labelledby": K,
      autoFocus: b,
      ..._ ? {
        value: Y
      } : {
        defaultValue: v
      },
      onChange(I) {
        const M = I.currentTarget.value;
        d?.(M, Ye(zo, I.nativeEvent)), A(M !== E.initialValue), U(M !== ""), I.nativeEvent.defaultPrevented || (k(P), O.change(M));
      },
      onFocus() {
        z(!0);
      },
      onBlur(I) {
        N(!0), z(!1), j === "onBlur" && O.commit(I.currentTarget.value);
      },
      onKeyDown(I) {
        I.currentTarget.tagName === "INPUT" && I.key === "Enter" && (N(!0), O.commit(I.currentTarget.value));
      }
    }, R, (I) => O.getValidationProps(G, I)],
    stateAttributesMapping: Ux
  });
}), DM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  return /* @__PURE__ */ S.jsx(zM, {
    ref: a,
    ...o
  });
});
function NM({ className: n, type: o, ...a }) {
  return /* @__PURE__ */ S.jsx(
    DM,
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
function cp({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
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
const jM = aa(
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
function fp({
  className: n,
  align: o = "inline-start",
  ...a
}) {
  return /* @__PURE__ */ S.jsx(
    "div",
    {
      role: "group",
      "data-slot": "input-group-addon",
      "data-align": o,
      className: Ke(jM({ align: o }), n),
      onClick: (i) => {
        i.target.closest("button") || i.currentTarget.parentElement?.querySelector("input, textarea")?.focus();
      },
      ...a
    }
  );
}
const kM = aa(
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
function _M({
  className: n,
  type: o = "button",
  variant: a = "ghost",
  size: i = "xs",
  ...c
}) {
  return /* @__PURE__ */ S.jsx(
    _t,
    {
      type: o,
      "data-size": i,
      variant: a,
      className: Ke(kM({ size: i }), n),
      ...c
    }
  );
}
function dp({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    NM,
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
const Bx = /* @__PURE__ */ y.createContext(void 0);
function fr(n) {
  const o = y.useContext(Bx);
  if (o === void 0 && !n)
    throw new Error(Mt(47));
  return o;
}
function HM() {
  return {
    ...Ku(),
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
const UM = {
  ...Qu,
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
class ig extends Ti {
  constructor(o, a, i = !1) {
    const c = {
      ...HM(),
      ...o
    }, f = new sa();
    c.open && o?.mounted === void 0 && (c.mounted = !0), c.floatingRootContext = Kp(f, a, i), super(c, {
      popupRef: /* @__PURE__ */ y.createRef(),
      backdropRef: /* @__PURE__ */ y.createRef(),
      internalBackdropRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ y.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ y.createRef(),
      stickIfOpenTimeout: new el(),
      triggerElements: f
    }, UM);
  }
  setOpen = (o, a) => {
    const i = a.reason === Pt, c = a.reason === ql && a.event.detail === 0, f = !o && (a.reason === Si || a.reason == null), p = qp(a), g = this.select("activeTriggerId");
    if (!o && a.reason === o0 && a.trigger == null && g != null && (a.trigger = this.context.triggerElements.getById(g) ?? this.select("activeTriggerElement") ?? void 0), this.context.onOpenChange?.(o, a), a.isCanceled)
      return;
    this.state.floatingRootContext.dispatchOpenChange(o, a);
    const m = () => {
      const d = {
        open: o,
        openChangeReason: a.reason
      };
      Gu(d, o, a.trigger, p()), this.update(d);
    };
    i ? (this.set("stickIfOpen", !0), this.context.stickIfOpenTimeout.start(w0, () => {
      this.set("stickIfOpen", !1);
    }), gl.flushSync(m)) : m(), c || f ? this.set("instantType", c ? "click" : "dismiss") : a.reason === To ? this.set("instantType", "focus") : this.set("instantType", void 0);
  };
  static useStore(o, a) {
    const {
      store: i,
      internalStore: c
    } = Gp(o, (f, p) => new ig(a, f, p));
    return y.useEffect(() => c?.disposeEffect(), [c]), i;
  }
  disposeEffect = () => this.context.stickIfOpenTimeout.disposeEffect();
}
function cb({
  props: n
}) {
  const {
    children: o,
    open: a,
    defaultOpen: i = !1,
    onOpenChange: c,
    onOpenChangeComplete: f,
    modal: p = !1,
    handle: g,
    triggerId: m,
    defaultTriggerId: d = null
  } = n, v = ig.useStore(g?.store, {
    modal: p,
    open: i,
    openProp: a,
    activeTriggerId: d,
    triggerIdProp: m
  });
  Xp(v, a, i, d), v.useControlledProp("openProp", a), v.useControlledProp("triggerIdProp", m);
  const b = v.useState("open"), x = v.useState("mounted"), R = v.useState("payload"), w = Kl() != null;
  v.useContextCallback("onOpenChange", c), v.useContextCallback("onOpenChangeComplete", f), K0(v, b), qu(v);
  const {
    forceUnmount: D
  } = Xu(b, v, () => {
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
    v.setOpen(!1, Ye(Hu));
  }, [v]);
  y.useImperativeHandle(n.actionsRef, () => ({
    unmount: D,
    close: T
  }), [D, T]);
  const N = b || x, A = y.useMemo(() => ({
    store: v
  }), [v]);
  return /* @__PURE__ */ S.jsxs(Bx.Provider, {
    value: A,
    children: [N && /* @__PURE__ */ S.jsx(IM, {
      store: v,
      modal: p
    }), typeof o == "function" ? o({
      payload: R
    }) : o]
  });
}
function LM(n) {
  return fr(!0) ? /* @__PURE__ */ S.jsx(cb, {
    props: n
  }) : /* @__PURE__ */ S.jsx(N0, {
    children: /* @__PURE__ */ S.jsx(cb, {
      props: n
    })
  });
}
function IM({
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
  }), c = i.reference ?? bt, f = i.trigger ?? bt, p = y.useMemo(() => bn(ia, i.floating), [i.floating]);
  return Fu(n, {
    activeTriggerProps: c,
    inactiveTriggerProps: f,
    popupProps: p
  }), null;
}
const BM = 300, VM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    disabled: p = !1,
    nativeButton: g = !0,
    handle: m,
    payload: d,
    openOnHover: v = !1,
    delay: b = BM,
    closeDelay: x = 0,
    id: R,
    ...w
  } = o, D = fr(!0), T = m?.store ?? D?.store;
  if (!T)
    throw new Error(Mt(74));
  const N = Bn(R), A = T.useState("isTriggerActive", N), E = T.useState("floatingRootContext"), z = T.useState("isOpenedByTrigger", N), U = T.useState("triggerPopupId", N), j = y.useRef(null), {
    registerTrigger: O,
    isMountedByThisTrigger: k
  } = Fp(N, j, T, {
    payload: d,
    disabled: p,
    openOnHover: v,
    closeDelay: x
  }), G = T.useState("openChangeReason"), P = T.useState("stickIfOpen"), ne = T.useState("openMethod"), K = T.useState("focusManagerModal"), Q = Zu(E, {
    enabled: !p && E != null && v && (ne !== "touch" || G !== ql),
    mouseOnly: !0,
    move: !1,
    handleClose: $u(),
    restMs: b,
    delay: {
      close: x
    },
    triggerElementRef: j,
    isActiveTrigger: A,
    isClosing: () => T.select("transitionStatus") === "ending"
  }), Z = Bu(E, {
    enabled: E != null,
    stickIfOpen: P
  }), q = mx(() => T.select("open"), (re) => {
    T.set("openMethod", re);
  }), _ = T.useState("triggerProps", k), {
    getButtonProps: Y,
    buttonRef: B
  } = Oo({
    disabled: p,
    native: g
  }), F = {
    open(re) {
      return re && G === ql ? Eu.open(re) : Wu.open(re);
    }
  }, {
    preFocusGuardRef: I,
    handlePreFocusGuardFocus: M,
    handleFocusTargetFocus: H
  } = kx(T, j), J = nt("button", o, {
    state: {
      disabled: p,
      open: z
    },
    ref: [B, a, O, j],
    props: [Z.reference, Q, _, q, {
      [E0]: "",
      id: N,
      "aria-haspopup": "dialog",
      "aria-expanded": z,
      "aria-controls": U
    }, w, Y],
    stateAttributesMapping: F
  });
  return k && !K ? /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [/* @__PURE__ */ S.jsx(Ro, {
      ref: I,
      onFocus: M
    }), /* @__PURE__ */ S.jsx(y.Fragment, {
      children: J
    }, N), /* @__PURE__ */ S.jsx(Ro, {
      ref: T.context.triggerFocusTargetRef,
      onFocus: H
    })]
  }) : /* @__PURE__ */ S.jsx(y.Fragment, {
    children: J
  }, N);
}), Vx = /* @__PURE__ */ y.createContext(void 0);
function PM() {
  const n = y.useContext(Vx);
  if (n === void 0)
    throw new Error(Mt(45));
  return n;
}
const YM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = o, {
    store: f
  } = fr();
  return f.useState("mounted") || i ? /* @__PURE__ */ S.jsx(Vx.Provider, {
    value: i,
    children: /* @__PURE__ */ S.jsx(Lu, {
      ref: a,
      ...c
    })
  }) : null;
}), Px = /* @__PURE__ */ y.createContext(void 0);
function GM() {
  const n = y.useContext(Px);
  if (!n)
    throw new Error(Mt(46));
  return n;
}
const qM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    anchor: p,
    positionMethod: g = "absolute",
    side: m = "bottom",
    align: d = "center",
    sideOffset: v = 0,
    alignOffset: b = 0,
    collisionBoundary: x = "clipping-ancestors",
    collisionPadding: R = 5,
    arrowPadding: w = 5,
    sticky: D = !1,
    disableAnchorTracking: T = !1,
    collisionAvoidance: N = Up,
    ...A
  } = o, {
    store: E
  } = fr(), z = PM(), U = Ip(), j = E.useState("floatingRootContext"), O = E.useState("mounted"), k = E.useState("open"), G = E.useState("openChangeReason"), P = E.useState("activeTriggerElement"), ne = E.useState("modal"), K = E.useState("openMethod"), Q = E.useState("positionerElement"), Z = E.useState("instantType"), q = E.useState("transitionStatus"), _ = E.useState("hasViewport"), Y = y.useRef(null), B = Yp(Q, !1, !1), F = sc({
    anchor: p,
    floatingRootContext: j,
    positionMethod: g,
    mounted: O,
    side: m,
    sideOffset: v,
    align: d,
    alignOffset: b,
    arrowPadding: w,
    collisionBoundary: x,
    collisionPadding: R,
    sticky: D,
    disableAnchorTracking: T,
    keepMounted: z,
    nodeId: U,
    collisionAvoidance: N,
    adaptiveOrigin: _ ? tg : void 0
  }), I = j.useState("domReferenceElement");
  xe(() => {
    const J = I, re = Y.current;
    if (J && (Y.current = J), re && J && J !== re) {
      E.set("instantType", void 0);
      const ie = new AbortController();
      return B(() => {
        E.set("instantType", "trigger-change");
      }, ie.signal), () => {
        ie.abort();
      };
    }
  }, [I, B, E]), lg(k && ne === !0 && G !== Pt, K === "touch", Q, P);
  const M = y.useCallback((J) => {
    E.set("positionerElement", J);
  }, [E]), H = {
    open: k,
    side: F.side,
    align: F.align,
    anchorHidden: F.anchorHidden,
    instant: Z
  }, te = uc(o, H, {
    styles: F.positionerStyles,
    transitionStatus: q,
    props: A,
    refs: [a, M],
    hidden: !O,
    inert: !k
  });
  return /* @__PURE__ */ S.jsxs(Px.Provider, {
    value: F,
    children: [O && ne === !0 && G !== Pt && /* @__PURE__ */ S.jsx(lc, {
      ref: E.context.internalBackdropRef,
      inert: nc(!k),
      cutout: P
    }), /* @__PURE__ */ S.jsx(D0, {
      id: U,
      children: te
    })]
  });
}), XM = /* @__PURE__ */ y.createContext(void 0);
function FM() {
  const [n, o] = y.useState(0), a = ze(() => (o((c) => c + 1), () => {
    o((c) => Math.max(0, c - 1));
  }));
  return {
    context: y.useMemo(() => ({
      register: a
    }), [a]),
    hasClosePart: n > 0
  };
}
function KM(n) {
  const {
    value: o,
    children: a
  } = n;
  return /* @__PURE__ */ S.jsx(XM.Provider, {
    value: o,
    children: a
  });
}
const QM = {
  ...ko,
  ...jo
}, ZM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    initialFocus: p,
    finalFocus: g,
    ...m
  } = o, {
    store: d
  } = fr(), v = GM(), b = ac() != null, {
    context: x,
    hasClosePart: R
  } = FM(), w = d.useState("open"), D = d.useState("openMethod"), T = d.useState("instantType"), N = d.useState("transitionStatus"), A = d.useState("popupProps"), E = d.useState("titleElementId"), z = d.useState("descriptionElementId"), U = d.useState("modal"), j = d.useState("mounted"), O = d.useState("openChangeReason"), k = d.useState("activeTriggerElement"), G = d.useState("floatingRootContext"), P = G.useState("floatingId"), ne = d.useState("disabled"), K = d.useState("openOnHover"), Q = d.useState("closeDelay"), Z = m.id ?? P;
  Ql({
    open: w,
    ref: d.context.popupRef,
    onComplete() {
      w && d.context.onOpenChangeComplete?.(!0);
    }
  }), $p(G, {
    enabled: K && !ne,
    closeDelay: Q
  });
  const q = p === void 0 ? X0(d.context.popupRef) : p, _ = U !== !1 && R;
  d.useSyncedValue("focusManagerModal", _);
  const Y = y.useCallback((I) => {
    d.set("popupElement", I);
  }, [d]), B = {
    open: w,
    side: v.side,
    align: v.align,
    instant: T,
    transitionStatus: N
  }, F = nt("div", o, {
    state: B,
    ref: [a, d.context.popupRef, Y],
    props: [A, {
      id: Z,
      role: "dialog",
      ...ia,
      "aria-labelledby": E,
      "aria-describedby": z,
      onKeyDown(I) {
        b && Ri.has(I.key) && I.stopPropagation();
      }
    }, Oi(N), m],
    stateAttributesMapping: QM
  });
  return /* @__PURE__ */ S.jsx(Iu, {
    context: G,
    openInteractionType: D,
    modal: _,
    disabled: !j || O === Pt,
    initialFocus: q,
    returnFocus: g,
    restoreFocus: "popup",
    previousFocusableElement: Rt(k) ? k : void 0,
    nextFocusableElement: d.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: d.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ S.jsx(KM, {
      value: x,
      children: F
    })
  });
}), JM = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
}), $M = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
function WM({ ...n }) {
  return /* @__PURE__ */ S.jsx(LM, { "data-slot": "popover", ...n });
}
function e2({ ...n }) {
  return /* @__PURE__ */ S.jsx(VM, { "data-slot": "popover-trigger", ...n });
}
function t2({
  className: n,
  align: o = "center",
  alignOffset: a = 0,
  side: i = "bottom",
  sideOffset: c = 4,
  portalContainer: f,
  positionerClassName: p,
  ...g
}) {
  return /* @__PURE__ */ S.jsx(YM, { container: f, children: /* @__PURE__ */ S.jsx(
    qM,
    {
      align: o,
      alignOffset: a,
      side: i,
      sideOffset: c,
      className: Ke("tw:isolate tw:z-[var(--z-popover)]", p),
      children: /* @__PURE__ */ S.jsx(
        ZM,
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
function fb({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
    "div",
    {
      "data-slot": "popover-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:text-[var(--fs-body-s)]", n),
      ...o
    }
  );
}
function db({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
    JM,
    {
      "data-slot": "popover-title",
      className: Ke("tw:font-medium", n),
      ...o
    }
  );
}
function pb({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    $M,
    {
      "data-slot": "popover-description",
      className: Ke("tw:text-muted-foreground", n),
      ...o
    }
  );
}
function Qr({
  className: n,
  orientation: o = "horizontal",
  ...a
}) {
  return /* @__PURE__ */ S.jsx(
    _x,
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
const Yx = /* @__PURE__ */ y.createContext(null), Gx = /* @__PURE__ */ y.createContext(null);
function Zl() {
  const n = y.useContext(Yx);
  if (n === null)
    throw new Error(Mt(60));
  return n;
}
function qx() {
  const n = y.useContext(Gx);
  if (n === null)
    throw new Error(Mt(61));
  return n;
}
const n2 = (n, o) => Object.is(n, o);
function ir(n, o, a) {
  return n == null || o == null ? Object.is(n, o) : a(n, o);
}
function l2(n, o, a) {
  return !n || n.length === 0 ? !1 : n.some((i) => i === void 0 ? !1 : ir(o, i, a));
}
function pi(n, o, a) {
  return !n || n.length === 0 ? -1 : n.findIndex((i) => i === void 0 ? !1 : ir(i, o, a));
}
function o2(n, o, a) {
  return n.filter((i) => !ir(o, i, a));
}
function pp(n) {
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
function Xx(n) {
  return n != null && n.length > 0 && typeof n[0] == "object" && n[0] != null && "items" in n[0];
}
function r2(n) {
  if (!Array.isArray(n))
    return n != null && "null" in n;
  const o = n;
  if (Xx(o)) {
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
function Fx(n, o) {
  if (o && n != null)
    return o(n) ?? "";
  if (n && typeof n == "object") {
    if ("label" in n && n.label != null)
      return String(n.label);
    if ("value" in n)
      return String(n.value);
  }
  return pp(n);
}
function nr(n, o) {
  return o && n != null ? o(n) ?? "" : n && typeof n == "object" && "value" in n && "label" in n ? pp(n.value) : pp(n);
}
function Kx(n, o, a) {
  function i() {
    return Fx(n, a);
  }
  if (a && n != null)
    return a(n);
  if (n && typeof n == "object" && "label" in n && n.label != null)
    return n.label;
  if (o && !Array.isArray(o))
    return o[n] ?? i();
  if (Array.isArray(o)) {
    const c = o, f = Xx(c) ? c.flatMap((p) => p.items) : c;
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
  return n.reduce((i, c, f) => (f > 0 && i.push(", "), i.push(/* @__PURE__ */ S.jsx(y.Fragment, {
    children: Kx(c, o, a)
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
    return n.multiple ? Array.isArray(i) && i.some((c) => ir(o, c, a)) : ir(o, i, a);
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
function i2(n, o, a = (i, c) => i === c) {
  return n.length === o.length && n.every((i, c) => a(i, o[c]));
}
function ii(n, o = Number.MIN_SAFE_INTEGER, a = Number.MAX_SAFE_INTEGER) {
  return Math.max(o, Math.min(n, a));
}
const Ll = 1;
function Qx(n, o) {
  return Math.max(0, n - o);
}
function s2(n, o) {
  if (o <= 0)
    return 0;
  const a = ii(n, 0, o), i = a, c = o - a, f = i <= Ll, p = c <= Ll;
  return f && p ? i <= c ? 0 : o : f ? 0 : p ? o : a;
}
function u2(n) {
  const {
    id: o,
    value: a,
    defaultValue: i = null,
    onValueChange: c,
    open: f,
    defaultOpen: p = !1,
    onOpenChange: g,
    name: m,
    form: d,
    autoComplete: v,
    disabled: b = !1,
    readOnly: x = !1,
    required: R = !1,
    modal: w = !0,
    actionsRef: D,
    inputRef: T,
    onOpenChangeComplete: N,
    items: A,
    multiple: E = !1,
    itemToStringLabel: z,
    itemToStringValue: U,
    isItemEqualToValue: j = n2,
    highlightItemOnHover: O = !0,
    children: k
  } = n, {
    clearErrors: G
  } = Lx(), {
    setDirty: P,
    setTouched: ne,
    setFocused: K,
    validityData: Q,
    setFilled: Z,
    name: q,
    disabled: _,
    validation: Y,
    validationMode: B
  } = cc(), F = ag({
    id: o
  }), I = _ || b, M = q ?? m, [H, te] = ra({
    controlled: a,
    default: E ? i ?? Gl : i,
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
  } = Yu(J), {
    openMethod: Te,
    triggerProps: Oe
  } = hx(J), He = xn(() => new G0({
    id: F,
    labelId: void 0,
    modal: w,
    multiple: E,
    itemToStringLabel: z,
    itemToStringValue: U,
    isItemEqualToValue: j,
    value: H,
    open: J,
    mounted: Ce,
    transitionStatus: Se,
    items: A,
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
  })).current, ae = Pe(He, Be.activeIndex), pe = Pe(He, Be.selectedIndex), Ue = Pe(He, Be.triggerElement), ve = Pe(He, Be.positionerElement), be = yM(Te), We = Te ?? be ?? null, rt = y.useMemo(() => E ? "" : nr(H, U), [E, H, U]), pt = y.useMemo(() => E && Array.isArray(H) ? H.map((qe) => nr(qe, U)) : nr(H, U), [E, H, U]), Dt = Yt(He.state.triggerElement), et = ze(() => pt);
  Ix(Dt, F, H, et, !I, m);
  const gt = y.useRef(H), At = E ? Array.isArray(H) && H.length > 0 : H != null && nr(H, U) !== "";
  xe(() => {
    H !== gt.current && He.set("forceMount", !0);
  }, [He, H]), xe(() => {
    Z(At);
  }, [At, Z]), xe(function() {
    const xt = fe.current;
    let Xt;
    if (E) {
      const nn = Array.isArray(H) ? H : [];
      if (nn.length === 0)
        Xt = null;
      else {
        const Wt = nn[nn.length - 1], Ct = pi(xt, Wt, j);
        Xt = Ct === -1 ? null : Ct;
      }
    } else {
      const nn = pi(xt, H, j);
      Xt = nn === -1 ? null : nn;
    }
    Xt === null && (_e.current = null), !J && He.set("selectedIndex", Xt);
  }, [At, E, J, H, fe, j, He, _e]);
  function mt(qe) {
    const xt = Q.initialValue;
    return Array.isArray(qe) && Array.isArray(xt) ? !i2(qe, xt, (Xt, nn) => ir(Xt, nn, j)) : qe !== xt;
  }
  gx(H, () => {
    G(M), P(mt(H)), Y.change(H);
  });
  const Mn = ze((qe, xt) => {
    g?.(qe, xt), !xt.isCanceled && (re(qe), !qe && (xt.reason === To || xt.reason === _u) && (ne(!0), K(!1), B === "onBlur" && Y.commit(H)));
  }), An = ze(() => {
    he(!1), He.update({
      activeIndex: null,
      openMethod: null
    }), N?.(!1);
  });
  Ql({
    enabled: !D,
    open: J,
    ref: se,
    onComplete() {
      J || An();
    }
  }), y.useImperativeHandle(D, () => ({
    unmount: An
  }), [An]);
  const Qe = ze((qe, xt) => {
    c?.(qe, xt), !xt.isCanceled && te(qe);
  }), ft = ze(() => {
    const qe = He.state.listElement || se.current;
    if (!qe)
      return;
    const xt = Qx(qe.scrollHeight, qe.clientHeight), Xt = s2(qe.scrollTop, xt), nn = Xt > 0, Wt = Xt < xt;
    He.state.scrollUpArrowVisible !== nn && He.set("scrollUpArrowVisible", nn), He.state.scrollDownArrowVisible !== Wt && He.set("scrollDownArrowVisible", Wt);
  }), It = Z0({
    open: J,
    onOpenChange: Mn,
    elements: {
      reference: Ue,
      floating: ve
    }
  }), Ht = Bu(It, {
    enabled: !x && !I,
    event: "mousedown"
  }), Ut = Ei(It), Nt = W0(It, {
    enabled: !x && !I,
    listRef: ie,
    activeIndex: ae,
    selectedIndex: pe,
    disabledIndices: Gl,
    onNavigate(qe) {
      qe === null && !J || He.set("activeIndex", qe);
    },
    focusItemOnHover: O
  }), Gt = ex(It, {
    enabled: !x && !I && (J || !E),
    listRef: oe,
    activeIndex: ae,
    selectedIndex: pe,
    // Skip disabled items while matching so typeahead advances to the next selectable item
    // (a click can never select a disabled item and native `<select>` skips them too). Resolve
    // the disabled state from the element via the attribute-only `isElementDisabled` so the
    // hidden, force-mounted items used for closed-trigger typeahead aren't dropped by the
    // `elementsRef`/visibility filter that `disabledIndices` deliberately sidesteps.
    disabledIndices: (qe) => Hx(ie.current[qe]),
    onMatch(qe) {
      J ? He.set("activeIndex", qe) : Qe(fe.current[qe], Ye("none"));
    },
    onTyping(qe) {
      ye.current = qe;
    }
  }), Sn = y.useMemo(() => {
    const qe = bn(Gt.reference, Nt.reference, Ut.reference, Ht.reference, Oe);
    return F && (qe.id = F), qe;
  }, [Ht.reference, Gt.reference, Nt.reference, Ut.reference, Oe, F]), zn = y.useMemo(() => bn(ia, Gt.floating, Nt.floating, Ut.floating), [Gt.floating, Nt.floating, Ut.floating]), Vn = Nt.item ?? bt;
  Cp(() => {
    He.update({
      popupProps: zn,
      triggerProps: Sn
    });
  }), xe(() => {
    He.update({
      id: F,
      modal: w,
      multiple: E,
      value: H,
      open: J,
      mounted: Ce,
      transitionStatus: Se,
      popupProps: zn,
      triggerProps: Sn,
      items: A,
      itemToStringLabel: z,
      itemToStringValue: U,
      isItemEqualToValue: j,
      openMethod: We
    });
  }, [He, F, w, E, H, J, Ce, Se, zn, Sn, A, z, U, j, We]);
  const qt = y.useMemo(() => ({
    store: He,
    name: M,
    required: R,
    disabled: I,
    readOnly: x,
    multiple: E,
    highlightItemOnHover: O,
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
    onOpenChangeComplete: N,
    alignItemWithTriggerActiveRef: we,
    initialValueRef: gt
  }), [He, M, R, I, x, E, O, Qe, Mn, Vn, Y, N, ft]), Pn = Eo(T, Y.inputRef), hl = E && Array.isArray(H) && H.length > 0, tl = E ? void 0 : M, yl = y.useMemo(() => !E || !Array.isArray(H) || !M ? null : H.map((qe) => {
    const xt = nr(qe, U);
    return /* @__PURE__ */ S.jsx("input", {
      type: "hidden",
      form: d,
      name: M,
      value: xt,
      disabled: I
    }, xt);
  }), [E, H, d, M, U, I]);
  return /* @__PURE__ */ S.jsx(Yx.Provider, {
    value: qt,
    children: /* @__PURE__ */ S.jsxs(Gx.Provider, {
      value: It,
      children: [k, /* @__PURE__ */ S.jsx("input", {
        ...Y.getValidationProps(I, {
          onFocus() {
            He.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              focusVisible: !0
            });
          },
          // Handle browser autofill.
          onChange(qe) {
            if (qe.nativeEvent.defaultPrevented || I || x)
              return;
            const xt = qe.currentTarget.value, Xt = Ye(zo, qe.nativeEvent);
            function nn() {
              if (E)
                return;
              const Wt = xt.toLowerCase();
              let Ct = fe.current.findIndex((rl) => nr(rl, U).toLowerCase() === Wt || Fx(rl, z).toLowerCase() === Wt);
              Ct === -1 && (Ct = fe.current.findIndex((rl, ua) => {
                const Ai = oe.current[ua];
                return Ai != null && Ai.toLowerCase() === Wt;
              }));
              const un = Ct === -1 ? void 0 : fe.current[Ct];
              un != null && Qe(un, Xt);
            }
            He.set("forceMount", !0), queueMicrotask(nn);
          }
        }),
        id: F && tl == null ? `${F}-hidden-input` : void 0,
        form: d,
        name: tl,
        autoComplete: v,
        value: rt,
        disabled: I,
        required: R && !hl,
        readOnly: x,
        ref: Pn,
        style: M ? cR : s0,
        tabIndex: -1,
        "aria-hidden": !0,
        suppressHydrationWarning: !0
      }), yl]
    })
  });
}
function c2(n, o) {
  return n ?? o;
}
const eu = 2, f2 = 400, d2 = {
  ...Eu,
  ...Ux,
  popupSide: (n) => n ? {
    "data-popup-side": n
  } : null,
  value: () => null
}, p2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    id: f,
    disabled: p = !1,
    nativeButton: g = !0,
    style: m,
    ...d
  } = o, {
    setTouched: v,
    setFocused: b,
    validationMode: x,
    state: R,
    disabled: w
  } = cc(), {
    labelId: D
  } = rg(), {
    store: T,
    setOpen: N,
    selectionRef: A,
    validation: E,
    readOnly: z,
    required: U,
    alignItemWithTriggerActiveRef: j,
    disabled: O
  } = Zl(), k = w || O || p, G = Pe(T, Be.open), P = Pe(T, Be.mounted), ne = Pe(T, Be.value), K = Pe(T, Be.triggerProps), Q = Pe(T, Be.positionerElement), Z = Pe(T, Be.listElement), q = Pe(T, Be.popupSide), _ = Pe(T, Be.id), Y = Pe(T, Be.labelId), B = Pe(T, Be.hasSelectedValue), F = P && Q ? q : null, I = f ?? _, M = c2(D, Y);
  ag({
    id: I
  });
  const H = Yt(Q), te = y.useRef(null), {
    getButtonProps: J,
    buttonRef: re
  } = Oo({
    disabled: k,
    native: g
  }), ie = ze((ye) => {
    T.set("triggerElement", ye);
  }), oe = an(), se = an(), ge = an();
  y.useEffect(() => {
    if (G)
      return ge.start(f2, () => {
        A.current.allowUnselectedMouseUp = !0, A.current.allowSelectedMouseUp = !0;
      }), () => {
        ge.clear();
      };
    A.current = {
      allowSelectedMouseUp: !1,
      allowUnselectedMouseUp: !1,
      dragY: 0
    }, se.clear();
  }, [G, A, se, ge]);
  const je = bn(K, {
    id: I,
    role: "combobox",
    "aria-expanded": G ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": G ? Z?.id ?? mu(Q)?.id : void 0,
    "aria-labelledby": M,
    "aria-readonly": z || void 0,
    "aria-required": U || void 0,
    tabIndex: k ? -1 : 0,
    onFocus(ye) {
      b(!0), G && j.current && N(!1, Ye(zo, ye.nativeEvent)), oe.start(0, () => {
        T.set("forceMount", !0);
      });
    },
    onBlur(ye) {
      Le(Q, ye.relatedTarget) || (v(!0), b(!1), x === "onBlur" && E.commit(ne));
    },
    onMouseDown(ye) {
      if (G)
        return;
      const Re = tt(ye.currentTarget);
      function _e(ke) {
        if (!te.current)
          return;
        const we = ke.target;
        if (Le(te.current, we) || Le(H.current, we))
          return;
        const Ce = Dx(te.current);
        ke.clientX >= Ce.left - eu && ke.clientX <= Ce.right + eu && ke.clientY >= Ce.top - eu && ke.clientY <= Ce.bottom + eu || N(!1, Ye(r0, ke));
      }
      se.start(0, () => {
        Re.addEventListener("mouseup", _e, {
          once: !0
        });
      });
    }
  }, d, J), Ee = E.getValidationProps(k, je);
  Ee.role = "combobox";
  const fe = {
    ...R,
    open: G,
    disabled: k,
    value: ne,
    readOnly: z,
    popupSide: F,
    placeholder: !B
  };
  return nt("button", o, {
    ref: [a, te, re, ie],
    state: fe,
    stateAttributesMapping: d2,
    props: Ee
  });
}), g2 = {
  value: () => null
}, m2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    className: i,
    render: c,
    children: f,
    placeholder: p,
    style: g,
    ...m
  } = o, {
    store: d,
    valueRef: v
  } = Zl(), b = Pe(d, Be.value), x = Pe(d, Be.items), R = Pe(d, Be.itemToStringLabel), w = Pe(d, Be.hasSelectedValue), D = !w && p != null && f == null, T = Pe(d, Be.hasNullItemLabel, D), N = {
    value: b,
    placeholder: !w
  };
  let A = null;
  return typeof f == "function" ? A = f(b) : f != null ? A = f : !w && p != null && !T ? A = p : Array.isArray(b) ? A = a2(b, x, R) : A = Kx(b, x, R), nt("span", o, {
    state: N,
    ref: [a, v],
    props: [{
      children: A
    }, m],
    stateAttributesMapping: g2
  });
}), h2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
    stateAttributesMapping: Wu
  });
}), y2 = /* @__PURE__ */ y.createContext(void 0), v2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    store: i
  } = Zl(), c = Pe(i, Be.mounted), f = Pe(i, Be.forceMount);
  return c || f ? /* @__PURE__ */ S.jsx(y2.Provider, {
    value: !0,
    children: /* @__PURE__ */ S.jsx(Lu, {
      ref: a,
      ...o
    })
  }) : null;
}), Zx = /* @__PURE__ */ y.createContext(void 0);
function Jx() {
  const n = y.useContext(Zx);
  if (!n)
    throw new Error(Mt(59));
  return n;
}
function Cu(n, o) {
  n && Object.assign(n.style, o);
}
const $x = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
}, b2 = {
  position: "fixed"
}, x2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    anchor: i,
    positionMethod: c = "absolute",
    className: f,
    render: p,
    side: g = "bottom",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: x,
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: D,
    alignItemWithTrigger: T = !0,
    collisionAvoidance: N = T0,
    style: A,
    ...E
  } = o, {
    store: z,
    listRef: U,
    labelsRef: j,
    alignItemWithTriggerActiveRef: O,
    selectedItemTextRef: k,
    valuesRef: G,
    initialValueRef: P,
    popupRef: ne,
    setValue: K
  } = Zl(), Q = qx(), Z = Pe(z, Be.open), q = Pe(z, Be.mounted), _ = Pe(z, Be.modal), Y = Pe(z, Be.value), B = Pe(z, Be.openMethod), F = Pe(z, Be.positionerElement), I = Pe(z, Be.triggerElement), M = Pe(z, Be.isItemEqualToValue), H = Pe(z, Be.transitionStatus), te = y.useRef(null), J = y.useRef(null), [re, ie] = y.useState(T), oe = q && re && B !== "touch";
  !q && re !== T && ie(T), xe(() => {
    q || (Be.scrollUpArrowVisible(z.state) && z.set("scrollUpArrowVisible", !1), Be.scrollDownArrowVisible(z.state) && z.set("scrollDownArrowVisible", !1));
  }, [z, q]), y.useImperativeHandle(O, () => oe), lg((oe || _) && Z, B === "touch", F, I);
  const se = sc({
    anchor: i,
    floatingRootContext: Q,
    positionMethod: c,
    mounted: q,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    arrowPadding: R,
    collisionBoundary: b,
    collisionPadding: x,
    sticky: w,
    disableAnchorTracking: D ?? oe,
    collisionAvoidance: N,
    keepMounted: !0
  }), ge = oe ? "none" : se.side, je = oe ? b2 : se.positionerStyles, Ee = {
    open: Z,
    side: ge,
    align: se.align,
    anchorHidden: se.anchorHidden
  };
  xe(() => {
    z.set("popupSide", se.side);
  }, [z, se.side]);
  const fe = ze((we) => {
    z.set("positionerElement", we);
  }), ye = uc(o, Ee, {
    styles: je,
    transitionStatus: H,
    props: E,
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
    if (Ce !== 0 && !z.state.multiple && Y !== null && pi(G.current, Y, M) === -1) {
      const Te = P.current, He = Te != null && pi(G.current, Te, M) !== -1 ? Te : null;
      K(He, he), He === null && (z.set("selectedIndex", null), k.current = null);
    }
    if (Ce !== 0 && z.state.multiple && Array.isArray(Y)) {
      const Se = (Oe) => pi(G.current, Oe, M) !== -1, Te = Y.filter((Oe) => Se(Oe));
      (Te.length !== Y.length || Te.some((Oe) => !l2(Y, Oe, M))) && (K(Te, he), Te.length === 0 && (z.set("selectedIndex", null), k.current = null));
    }
    if (Z && oe) {
      z.update({
        scrollUpArrowVisible: !1,
        scrollDownArrowVisible: !1
      });
      const Se = {
        height: ""
      };
      Cu(F, Se), Cu(ne.current, Se);
    }
  }), ke = y.useMemo(() => ({
    ...se,
    side: ge,
    alignItemWithTriggerActive: oe,
    setControlledAlignItemWithTrigger: ie,
    scrollUpArrowRef: te,
    scrollDownArrowRef: J
  }), [se, ge, oe, ie]);
  return /* @__PURE__ */ S.jsx(ng, {
    elementsRef: U,
    labelsRef: j,
    onMapChange: _e,
    children: /* @__PURE__ */ S.jsxs(Zx.Provider, {
      value: ke,
      children: [q && _ && /* @__PURE__ */ S.jsx(lc, {
        inert: nc(!Z),
        cutout: I
      }), ye]
    })
  });
}), tu = "base-ui-disable-scrollbar", gp = {
  className: tu,
  getElement(n) {
    return /* @__PURE__ */ S.jsx("style", {
      nonce: n,
      href: tu,
      precedence: "base-ui:low",
      children: `.${tu}{scrollbar-width:none}.${tu}::-webkit-scrollbar{display:none}`
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
    className: c,
    style: f,
    finalFocus: p,
    ...g
  } = o, {
    store: m,
    popupRef: d,
    onOpenChangeComplete: v,
    setOpen: b,
    valueRef: x,
    firstItemTextRef: R,
    selectedItemTextRef: w,
    multiple: D,
    handleScrollArrowVisibility: T,
    scrollHandlerRef: N,
    listRef: A,
    highlightItemOnHover: E
  } = Zl(), {
    side: z,
    align: U,
    alignItemWithTriggerActive: j,
    isPositioned: O,
    setControlledAlignItemWithTrigger: k
  } = Jx(), G = ac() != null, P = qx(), ne = ic(), {
    nonce: K,
    disableStyleElements: Q
  } = E2(), Z = Pe(m, Be.id), q = Pe(m, Be.open), _ = Pe(m, Be.openMethod), Y = Pe(m, Be.mounted), B = Pe(m, Be.popupProps), F = Pe(m, Be.transitionStatus), I = Pe(m, Be.triggerElement), M = Pe(m, Be.positionerElement), H = Pe(m, Be.listElement), te = y.useRef(!1), J = y.useRef(!1), re = y.useRef({}), ie = na(), oe = ze((Ee) => {
    if (!M || !d.current || !J.current)
      return;
    if (te.current || !j) {
      T();
      return;
    }
    const fe = M.style.top === "0px", ye = M.style.bottom === "0px";
    if (!fe && !ye) {
      T();
      return;
    }
    const Re = mb(M), _e = si(M.getBoundingClientRect().height, "y", Re), ke = tt(M), we = zt(M), Ce = we.getComputedStyle(M), he = parseFloat(Ce.marginTop), Se = parseFloat(Ce.marginBottom), Te = gb(we.getComputedStyle(d.current)), Oe = Math.min(ke.documentElement.clientHeight - he - Se, Te), He = Ee.scrollTop, ae = nu(Ee);
    let pe = 0, Ue = null, ve = !1, be = !1;
    const We = (et) => {
      M.style.height = `${et}px`;
    }, rt = (et, gt) => {
      const At = ii(et, 0, Oe - _e);
      At > 0 && We(_e + At), Ee.scrollTop = gt, Oe - (_e + At) <= Ll && (te.current = !0), T();
    }, pt = fe ? ae - He : He, Dt = Math.min(_e + pt, Oe);
    if (pe = Dt, pt <= Ll) {
      rt(pt, fe ? ae : 0);
      return;
    }
    if (Oe - Dt > Ll)
      fe ? be = !0 : Ue = 0;
    else if (ve = !0, ye && He < ae) {
      const et = _e + pt - Oe;
      Ue = He - (pt - et);
    }
    if (pe = Math.ceil(pe), pe !== 0 && We(pe), be || Ue != null) {
      const et = nu(Ee), gt = be ? et : ii(Ue, 0, et);
      Math.abs(Ee.scrollTop - gt) > Ll && (Ee.scrollTop = gt);
    }
    (ve || pe >= Oe - Ll) && (te.current = !0), T();
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
    align: U
  };
  xe(() => {
    !M || !d.current || Object.keys(re.current).length || (re.current = {
      top: M.style.top || "0",
      left: M.style.left || "0",
      right: M.style.right,
      height: M.style.height,
      bottom: M.style.bottom,
      minHeight: M.style.minHeight,
      maxHeight: M.style.maxHeight,
      marginTop: M.style.marginTop,
      marginBottom: M.style.marginBottom
    });
  }, [d, M]), xe(() => {
    q || j || (J.current = !1, te.current = !1, Cu(M, re.current));
  }, [q, j, M, d]), xe(() => {
    const Ee = d.current;
    if (!q || !I || !M || !Ee || j && !O || m.state.transitionStatus === "ending")
      return;
    if (!j) {
      J.current = !0, ie.request(T), Ee.style.removeProperty("--transform-origin");
      return;
    }
    const fe = C2(Ee);
    Ee.style.removeProperty("--transform-origin");
    try {
      let ye = w.current;
      ye?.isConnected || (ye = !Be.hasSelectedValue(m.state) && R.current?.isConnected ? R.current : null);
      const Re = x.current, _e = zt(M), ke = _e.getComputedStyle(M), we = _e.getComputedStyle(Ee), Ce = tt(I), he = mb(I), Se = lu(I.getBoundingClientRect(), he), Te = lu(M.getBoundingClientRect(), he), Oe = Se.height, He = H || Ee, ae = He.scrollHeight, pe = parseFloat(we.borderBottomWidth), Ue = parseFloat(ke.marginTop) || 10, ve = parseFloat(ke.marginBottom) || 10, be = parseFloat(ke.minHeight) || 100, We = gb(we), rt = 5, pt = 5, Dt = 20, et = Ce.documentElement.clientHeight - Ue - ve, gt = Ce.documentElement.clientWidth, At = et - Se.bottom + Oe;
      let mt, Mn = ne === "rtl" ? Se.right - Te.width : Se.left, An = 0;
      if (ye && Re) {
        const qt = lu(Re.getBoundingClientRect(), he);
        mt = lu(ye.getBoundingClientRect(), he), Mn = Te.left + (ne === "rtl" ? qt.right - mt.right : qt.left - mt.left);
        const Pn = qt.top - Se.top + qt.height / 2;
        An = mt.top - Te.top + mt.height / 2 - Pn;
      }
      const Qe = At + An + ve + pe;
      let ft = Math.min(et, Qe);
      const It = et - Ue - ve, Ht = Qe - ft, Ut = gt - pt;
      M.style.left = `${ii(Mn, rt, Ut - Te.width)}px`, M.style.height = `${ft}px`, M.style.maxHeight = "none", M.style.marginTop = `${Ue}px`, M.style.marginBottom = `${ve}px`, Ee.style.height = "100%";
      const Nt = nu(He), Gt = Ht >= Nt - Ll;
      Gt && (ft = Math.min(et, Te.height) - (Ht - Nt));
      const Sn = Se.top < Dt || Se.bottom > et - Dt || Math.ceil(ft) + Ll < Math.min(ae, be), zn = (_e.visualViewport?.scale ?? 1) !== 1 && Ao;
      if (Sn || zn) {
        J.current = !0, Cu(M, re.current), k(!1);
        return;
      }
      const Vn = Math.max(be, ft);
      if (Gt) {
        const qt = Math.max(0, et - Qe);
        M.style.top = Te.height >= It ? "0" : `${qt}px`, M.style.height = `${ft}px`, He.scrollTop = nu(He);
      } else
        M.style.bottom = "0", He.scrollTop = Ht;
      if (mt) {
        const qt = Te.top, Pn = Te.height, hl = mt.top + mt.height / 2, tl = Pn > 0 ? (hl - qt) / Pn * 100 : 50, yl = ii(tl, 0, 100);
        Ee.style.setProperty("--transform-origin", `50% ${yl}%`);
      }
      (Vn === et || ft >= We) && (te.current = !0), T(), E && m.state.selectedIndex === null && m.state.activeIndex === null && A.current[0] != null && m.set("activeIndex", 0), J.current = !0;
    } finally {
      fe();
    }
  }, [m, q, M, I, x, R, w, d, T, j, k, ie, H, A, E, ne, O]), y.useEffect(() => {
    if (!j || !M || !q)
      return;
    const Ee = zt(M);
    function fe(ye) {
      b(!1, Ye(rR, ye));
    }
    return Je(Ee, "resize", fe);
  }, [b, j, M, q]);
  const ge = {
    ...H ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": D || void 0,
      id: `${Z}-list`
    },
    onKeyDown(Ee) {
      G && Ri.has(Ee.key) && Ee.stopPropagation();
    },
    onScroll(Ee) {
      H || oe(Ee.currentTarget);
    },
    ...j && {
      style: H ? {
        height: "100%"
      } : $x
    }
  }, je = nt("div", o, {
    ref: [a, d],
    state: se,
    stateAttributesMapping: T2,
    props: [B, ge, Oi(F), {
      className: !H && j ? gp.className : void 0
    }, g]
  });
  return /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [!Q && gp.getElement(K), /* @__PURE__ */ S.jsx(Iu, {
      context: P,
      modal: !1,
      disabled: !Y,
      openInteractionType: _,
      returnFocus: p,
      restoreFocus: !0,
      children: je
    })]
  });
});
function gb(n) {
  const o = n.maxHeight || "";
  return o.endsWith("px") && parseFloat(o) || 1 / 0;
}
function nu(n) {
  return Qx(n.scrollHeight, n.clientHeight);
}
function mb(n) {
  return L0.getScale(n);
}
function si(n, o, a) {
  return n / a[o];
}
function lu(n, o) {
  return yi({
    x: si(n.x, "x", o),
    y: si(n.y, "y", o),
    width: si(n.width, "x", o),
    height: si(n.height, "y", o)
  });
}
const hb = [["transform", "none"], ["scale", "1"], ["translate", "0 0"]];
function C2(n) {
  const {
    style: o
  } = n, a = {};
  for (const [i, c] of hb)
    a[i] = o.getPropertyValue(i), o.setProperty(i, c, "important");
  return () => {
    for (const [i] of hb) {
      const c = a[i];
      c ? o.setProperty(i, c) : o.removeProperty(i);
    }
  };
}
const O2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = o, {
    store: g,
    scrollHandlerRef: m
  } = Zl(), {
    alignItemWithTriggerActive: d
  } = Jx(), v = Pe(g, Be.hasScrollArrows), b = Pe(g, Be.openMethod), x = Pe(g, Be.multiple), w = {
    id: `${Pe(g, Be.id)}-list`,
    role: "listbox",
    "aria-multiselectable": x || void 0,
    onScroll(T) {
      m.current?.(T.currentTarget);
    },
    ...d && {
      style: $x
    },
    className: v && b !== "touch" ? gp.className : void 0
  }, D = ze((T) => {
    g.set("listElement", T);
  });
  return nt("div", o, {
    ref: [a, D],
    props: [w, p]
  });
}), Wx = /* @__PURE__ */ y.createContext(void 0);
function sg() {
  const n = y.useContext(Wx);
  if (!n)
    throw new Error(Mt(57));
  return n;
}
const M2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    value: p = null,
    label: g,
    disabled: m = !1,
    nativeButton: d = !1,
    ...v
  } = o, b = y.useRef(null), x = Ci({
    label: g,
    textRef: b,
    indexGuessBehavior: wx.GuessFromOrder
  }), {
    store: R,
    itemProps: w,
    setOpen: D,
    setValue: T,
    selectionRef: N,
    typingRef: A,
    valuesRef: E,
    multiple: z,
    selectedItemTextRef: U,
    disabled: j,
    readOnly: O
  } = Zl(), k = Pe(R, Be.isActive, x.index), G = Pe(R, Be.open), P = Pe(R, Be.isSelected, p), ne = Pe(R, Be.isSelectedByFocus, x.index), K = Pe(R, Be.isItemEqualToValue), Q = x.index, Z = Q !== -1, q = y.useRef(null);
  xe(() => {
    if (!Z)
      return;
    const oe = E.current;
    return oe[Q] = p, () => {
      delete oe[Q];
    };
  }, [Z, Q, p, E]), xe(() => {
    if (!Z)
      return;
    const oe = R.state.value;
    let se = oe;
    z && Array.isArray(oe) && (se = oe.length > 0 ? oe[oe.length - 1] : void 0), se !== void 0 && ir(p, se, K) && (R.set("selectedIndex", Q), b.current && (U.current = b.current));
  }, [Z, Q, z, K, R, p, U]);
  const _ = y.useRef(null), Y = y.useRef("mouse"), B = y.useRef(!1), {
    getButtonProps: F,
    buttonRef: I
  } = Oo({
    disabled: m,
    focusableWhenDisabled: !0,
    native: d,
    composite: !0
  }), M = {
    disabled: m,
    selected: P,
    highlighted: k
  };
  function H(oe) {
    if (j || O)
      return;
    const se = R.state.value;
    if (z) {
      const ge = Array.isArray(se) ? se : [], je = P ? o2(ge, p, K) : [...ge, p];
      T(je, Ye($r, oe));
    } else
      T(p, Ye($r, oe)), D(!1, Ye($r, oe));
  }
  function te() {
    N.current.dragY = 0;
  }
  const J = {
    role: "option",
    "aria-selected": P,
    tabIndex: G && k ? 0 : -1,
    onKeyDown(oe) {
      _.current = oe.key, R.set("activeIndex", Q), oe.key === " " && A.current && oe.preventDefault();
    },
    onClick(oe) {
      const se = oe.type === "click" && Y.current !== "touch", ge = oe.nativeEvent.pointerType, je = se && zp(oe.nativeEvent) && // Generic no-pointer `detail === 0` clicks stay tied to highlight state. Virtual
      // clicks that carry browser pointer data, including an empty string from assistive
      // technology, can activate unhighlighted items.
      (ge !== void 0 || k), Ee = se && !je && !B.current;
      B.current = !1, !(oe.type === "keydown" && _.current === null) && (m || oe.type === "keydown" && _.current === " " && A.current || Ee || (_.current = null, H(oe.nativeEvent)));
    },
    onPointerEnter(oe) {
      Y.current = oe.pointerType;
    },
    onPointerMove(oe) {
      if (oe.pointerType === "mouse" && oe.buttons === 1) {
        const se = N.current;
        se.dragY += oe.movementY, se.dragY ** 2 >= 64 && (se.allowUnselectedMouseUp = !0);
      }
    },
    onPointerDown(oe) {
      Y.current = oe.pointerType, B.current = !0, te();
    },
    onMouseUp() {
      if (te(), m || Y.current === "touch" || B.current)
        return;
      const oe = !N.current.allowSelectedMouseUp && P, se = !N.current.allowUnselectedMouseUp && !P;
      oe || se || (B.current = !0, q.current?.click(), B.current = !1);
    }
  }, re = nt("div", o, {
    ref: [I, a, x.ref, q],
    state: M,
    props: [w, J, v, F]
  }), ie = y.useMemo(() => ({
    selected: P,
    index: Q,
    textRef: b,
    selectedByFocus: ne,
    hasRegistered: Z
  }), [P, Q, b, ne, Z]);
  return /* @__PURE__ */ S.jsx(Wx.Provider, {
    value: ie,
    children: re
  });
})), A2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const i = o.keepMounted ?? !1, {
    selected: c
  } = sg();
  return i || c ? /* @__PURE__ */ S.jsx(z2, {
    ...o,
    ref: a
  }) : null;
}), z2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef((n, o) => {
  const {
    render: a,
    className: i,
    style: c,
    keepMounted: f,
    ...p
  } = n, {
    selected: g
  } = sg(), m = y.useRef(null), {
    transitionStatus: d,
    setMounted: v
  } = Yu(g), x = nt("span", n, {
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
  }), x;
})), D2 = /* @__PURE__ */ y.memo(/* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    index: i,
    textRef: c,
    selectedByFocus: f,
    hasRegistered: p
  } = sg(), {
    firstItemTextRef: g,
    selectedItemTextRef: m
  } = Zl(), {
    render: d,
    className: v,
    style: b,
    ...x
  } = o, R = y.useCallback((D) => {
    D && (p && i === 0 && (g.current = D), p && f && (m.current = D));
  }, [g, m, i, f, p]);
  return nt("div", o, {
    ref: [R, a, c],
    props: x
  });
})), N2 = /* @__PURE__ */ y.createContext(void 0), j2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
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
  return /* @__PURE__ */ S.jsx(N2.Provider, {
    value: d,
    children: v
  });
});
function eS({ ...n }) {
  return /* @__PURE__ */ S.jsx(u2, { "data-slot": "select", ...n });
}
function tS({ ...n }) {
  return /* @__PURE__ */ S.jsx(j2, { "data-slot": "select-group", ...n });
}
function nS({ ...n }) {
  return /* @__PURE__ */ S.jsx(m2, { "data-slot": "select-value", ...n });
}
function lS({
  className: n,
  size: o = "default",
  children: a,
  ...i
}) {
  return /* @__PURE__ */ S.jsxs(
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
        /* @__PURE__ */ S.jsx(h2, { "data-icon": "select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ S.jsx(Tb, {}) })
      ]
    }
  );
}
function oS({
  className: n,
  children: o,
  portalContainer: a,
  positionerClassName: i,
  ...c
}) {
  return /* @__PURE__ */ S.jsx(v2, { container: a, children: /* @__PURE__ */ S.jsx(
    x2,
    {
      sideOffset: 4,
      className: Ke("tw:z-[var(--z-popover)]", i),
      children: /* @__PURE__ */ S.jsx(
        R2,
        {
          "data-slot": "select-content",
          className: Ke(
            "tw:min-w-(--anchor-width) tw:max-h-(--available-height) tw:origin-(--transform-origin) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-[var(--radius-control)] tw:border tw:border-border tw:bg-popover tw:p-1 tw:text-[var(--fs-body-s)] tw:text-popover-foreground tw:shadow-md tw:outline-none",
            n
          ),
          ...c,
          children: /* @__PURE__ */ S.jsx(O2, { className: "tw:flex tw:flex-col tw:gap-0.5", children: o })
        }
      )
    }
  ) });
}
function rS({ className: n, children: o, ...a }) {
  return /* @__PURE__ */ S.jsxs(
    M2,
    {
      "data-slot": "select-item",
      className: Ke(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-[var(--radius-control)] tw:py-1.5 tw:pr-8 tw:pl-2 tw:text-[var(--fs-body-s)] tw:outline-none tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50",
        n
      ),
      ...a,
      children: [
        /* @__PURE__ */ S.jsx("span", { className: "tw:absolute tw:right-2 tw:flex tw:size-3.5 tw:items-center tw:justify-center", "aria-hidden": "true", children: /* @__PURE__ */ S.jsx(A2, { children: /* @__PURE__ */ S.jsx(cu, { "data-icon": "select-check" }) }) }),
        /* @__PURE__ */ S.jsx(D2, { children: o })
      ]
    }
  );
}
function k2(n) {
  const o = y.useContext(tx) ? "drawer" : "dialog";
  return lx(n, o);
}
function _2({ ...n }) {
  return /* @__PURE__ */ S.jsx(k2, { "data-slot": "sheet", ...n });
}
function H2({ ...n }) {
  return /* @__PURE__ */ S.jsx(dx, { "data-slot": "sheet-portal", ...n });
}
function U2({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
    ox,
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
  showCloseButton: c = !0,
  showOverlay: f = !0,
  ...p
}) {
  return /* @__PURE__ */ S.jsxs(H2, { children: [
    f && /* @__PURE__ */ S.jsx(U2, {}),
    /* @__PURE__ */ S.jsxs(
      fx,
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
          c && /* @__PURE__ */ S.jsxs(
            rx,
            {
              "data-slot": "sheet-close",
              render: /* @__PURE__ */ S.jsx(
                _t,
                {
                  variant: "ghost",
                  className: "tw:absolute tw:top-3 tw:right-3",
                  size: "icon-sm"
                }
              ),
              children: [
                /* @__PURE__ */ S.jsx(gi, {}),
                /* @__PURE__ */ S.jsx("span", { className: "tw:sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function I2({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
    "div",
    {
      "data-slot": "sheet-header",
      className: Ke("tw:flex tw:flex-col tw:gap-0.5 tw:p-4", n),
      ...o
    }
  );
}
function B2({ className: n, ...o }) {
  return /* @__PURE__ */ S.jsx(
    px,
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
  return /* @__PURE__ */ S.jsx(
    ax,
    {
      "data-slot": "sheet-description",
      className: Ke("tw:text-[var(--fs-body-s)] tw:text-muted-foreground", n),
      ...o
    }
  );
}
const aS = /* @__PURE__ */ y.createContext(void 0);
function P2(n = !0) {
  const o = y.useContext(aS);
  if (o === void 0 && !n)
    throw new Error(Mt(7));
  return o;
}
const Y2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    className: i,
    defaultPressed: c = !1,
    disabled: f = !1,
    form: p,
    // never participates in form validation
    onPressedChange: g,
    pressed: m,
    render: d,
    type: v,
    // cannot change button type
    value: b,
    nativeButton: x = !0,
    style: R,
    ...w
  } = o, D = Bn(b || void 0), T = P2(), N = T?.value ?? [], A = T ? void 0 : c, E = (f || T?.disabled) ?? !1, [z, U] = ra({
    controlled: T ? D !== void 0 && N.indexOf(D) > -1 : m,
    default: A,
    name: "Toggle",
    state: "pressed"
  }), {
    getButtonProps: j,
    buttonRef: O
  } = Oo({
    disabled: E,
    native: x
  }), k = {
    disabled: E,
    pressed: z
  }, G = [O, a], P = [{
    "aria-pressed": z,
    onClick(Q) {
      const Z = !z, q = Ye(zo, Q.nativeEvent);
      g?.(Z, q), !q.isCanceled && (D && T?.setGroupValue?.(D, Z, q), !q.isCanceled && U(Z));
    }
  }, w, j], ne = nt("button", o, {
    enabled: !T,
    state: k,
    ref: G,
    props: P
  }), K = y.useMemo(() => ({
    disabled: E,
    focusableWhenDisabled: !1
  }), [E]);
  return T ? /* @__PURE__ */ S.jsx(Nx, {
    tag: "button",
    render: d,
    className: i,
    style: R,
    metadata: K,
    state: k,
    refs: G,
    props: P
  }) : ne;
}), G2 = "data-composite-item-active", q2 = [];
function X2(n) {
  const {
    loopFocus: o = !0,
    orientation: a = "both",
    grid: i,
    onLoop: c,
    direction: f,
    highlightedIndex: p,
    onHighlightedIndexChange: g,
    rootRef: m,
    enableHomeAndEndKeys: d = !1,
    stopEventPropagation: v = !1,
    disabledIndices: b,
    modifierKeys: x = q2
  } = n, [R, w] = y.useState(0), D = i != null, T = y.useRef(null), N = Eo(T, m), A = y.useRef([]), E = y.useRef(!1), z = p ?? R, U = ze((P, ne = !1) => {
    if ((g ?? w)(P), ne) {
      const K = A.current[P];
      ob(T.current, K, f, a);
    }
  }), j = ze((P) => {
    if (P.size === 0 || E.current)
      return;
    E.current = !0;
    const ne = Array.from(P.keys()), K = ne.find((Z) => Z?.hasAttribute(G2)) ?? null, Q = K ? ne.indexOf(K) : -1;
    if (Q !== -1)
      U(Q);
    else if (vu(ne, z, b)) {
      const Z = Il(ne, {
        disabledIndices: b
      });
      ui(ne, Z) || U(Z);
    }
    ob(T.current, K, f, a);
  });
  xe(() => {
    if (b == null || p != null || !E.current)
      return;
    const P = A.current;
    if (vu(P, z, b)) {
      const ne = Il(P, {
        disabledIndices: b
      });
      ui(P, ne) || U(ne);
    }
  }, [b, p, z, A, U]);
  const O = ze((P, ne, K) => c ? c(P, ne, K, A) : K), k = ze((P) => {
    const ne = d ? Ri : cx;
    if (!ne.has(P.key) || F2(P, x) || !T.current)
      return;
    const Q = f === "rtl", Z = Q ? Tu : Ru, q = {
      horizontal: Z,
      vertical: di,
      both: Z
    }[a], _ = Q ? Ru : Tu, Y = {
      horizontal: _,
      vertical: fi,
      both: _
    }[a], B = gn(P.nativeEvent);
    if (B != null && lb(B) && !Hx(B)) {
      const re = B.selectionStart, ie = B.selectionEnd, oe = B.value ?? "";
      if (re == null || P.shiftKey || re !== ie || P.key !== Y && re < oe.length || P.key !== q && re > 0)
        return;
    }
    let F = z;
    const I = ru(A, b), M = rp(A, b);
    i != null && (F = i({
      disabledIndices: b,
      elementsRef: A,
      event: P,
      highlightedIndex: z,
      loopFocus: o,
      maxIndex: M,
      minIndex: I,
      onLoop: O,
      orientation: a,
      rtl: Q
    }));
    const H = {
      horizontal: [Z],
      vertical: [di],
      both: [Z, di]
    }[a], te = {
      horizontal: [_],
      vertical: [fi],
      both: [_, fi]
    }[a], J = D ? ne : {
      horizontal: d ? gO : sx,
      vertical: d ? mO : ux,
      both: ne
    }[a];
    d && (P.key === ec ? F = I : P.key === tc && (F = M)), F === z && (H.includes(P.key) || te.includes(P.key)) && (o && F === M && H.includes(P.key) ? (F = I, c && (F = c(P, z, F, A))) : o && F === I && te.includes(P.key) ? (F = M, c && (F = c(P, z, F, A))) : F = Il(A.current, {
      startingIndex: F,
      decrement: te.includes(P.key),
      disabledIndices: b
    })), F !== z && !ui(A.current, F) && (v && P.stopPropagation(), J.has(P.key) && P.preventDefault(), U(F, !0), queueMicrotask(() => {
      A.current[F]?.focus();
    }));
  });
  return {
    props: {
      ref: N,
      onFocus(P) {
        const ne = T.current, K = gn(P.nativeEvent);
        !ne || K == null || !lb(K) || K.setSelectionRange(0, K.value.length ?? 0);
      },
      onKeyDown: k
    },
    highlightedIndex: z,
    onHighlightedIndexChange: U,
    elementsRef: A,
    disabledIndices: b,
    onMapChange: j,
    relayKeyboardEvent: k
  };
}
function F2(n, o) {
  for (const a of xO.values())
    if (!o.includes(a) && n.getModifierState(a))
      return !0;
  return !1;
}
function K2(n) {
  const {
    render: o,
    className: a,
    style: i,
    refs: c = Gl,
    props: f = Gl,
    state: p = bt,
    stateAttributesMapping: g,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    orientation: v,
    grid: b,
    loopFocus: x,
    onLoop: R,
    enableHomeAndEndKeys: w,
    onMapChange: D,
    stopEventPropagation: T = !0,
    rootRef: N,
    disabledIndices: A,
    modifierKeys: E,
    highlightItemOnHover: z = !1,
    tag: U = "div",
    ...j
  } = n, O = ic(), {
    props: k,
    highlightedIndex: G,
    onHighlightedIndexChange: P,
    elementsRef: ne,
    onMapChange: K,
    relayKeyboardEvent: Q
  } = X2({
    grid: b,
    loopFocus: x,
    onLoop: R,
    orientation: v,
    highlightedIndex: m,
    onHighlightedIndexChange: d,
    rootRef: N,
    stopEventPropagation: T,
    enableHomeAndEndKeys: w,
    direction: O,
    disabledIndices: A,
    modifierKeys: E
  }), Z = nt(U, n, {
    state: p,
    ref: c,
    props: [k, ...f, j],
    stateAttributesMapping: g
  }), q = y.useMemo(() => ({
    highlightedIndex: G,
    onHighlightedIndexChange: P,
    highlightItemOnHover: z,
    relayKeyboardEvent: Q
  }), [G, P, z, Q]);
  return /* @__PURE__ */ S.jsx(kb.Provider, {
    value: q,
    children: /* @__PURE__ */ S.jsx(ng, {
      elementsRef: ne,
      onMapChange: (_) => {
        D?.(_), K(_);
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
const yb = {
  multiple(n) {
    return n ? {
      [J2.multiple]: ""
    } : null;
  }
}, $2 = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    defaultValue: i,
    disabled: c = !1,
    loopFocus: f = !0,
    onValueChange: p,
    orientation: g = "horizontal",
    multiple: m = !1,
    value: d,
    className: v,
    render: b,
    style: x,
    ...R
  } = o, w = ac(), D = Z2(), T = y.useMemo(() => d !== void 0 || i !== void 0, [d, i]), N = (w?.disabled ?? !1) || (D?.disabled ?? !1) || c, [A, E] = ra({
    controlled: d,
    default: d === void 0 ? i ?? Gl : void 0,
    name: "ToggleGroup",
    state: "value"
  }), z = ze((G, P, ne) => {
    let K;
    m ? (K = A.slice(), P ? K.push(G) : K.splice(A.indexOf(G), 1)) : K = P ? [G] : [], p?.(K, ne), !ne.isCanceled && E(K);
  }), U = {
    disabled: N,
    multiple: m,
    orientation: g
  }, j = y.useMemo(() => ({
    disabled: N,
    orientation: g,
    setGroupValue: z,
    value: A,
    isValueInitialized: T
  }), [N, g, z, A, T]), O = {
    role: "group"
  }, k = nt("div", o, {
    enabled: !!w,
    state: U,
    ref: a,
    props: [O, R],
    stateAttributesMapping: yb
  });
  return /* @__PURE__ */ S.jsx(aS.Provider, {
    value: j,
    children: w ? k : /* @__PURE__ */ S.jsx(K2, {
      render: b,
      className: v,
      style: x,
      state: U,
      refs: [a],
      props: [O, R],
      stateAttributesMapping: yb,
      loopFocus: f,
      enableHomeAndEndKeys: !0,
      orientation: g
    })
  });
}), W2 = aa(
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
function Xd({
  className: n,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    $2,
    {
      "data-slot": "toggle-group",
      className: Ke("tw:flex tw:w-fit tw:flex-row tw:items-center tw:gap-1", n),
      ...o
    }
  );
}
function Fd({
  className: n,
  variant: o = "default",
  size: a = "default",
  ...i
}) {
  return /* @__PURE__ */ S.jsx(
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
  return /* @__PURE__ */ S.jsx(tE, { "data-slot": "spinner", role: "status", "aria-label": "Loading", className: Ke("tw:size-4 tw:animate-spin", n), ...o });
}
const iS = /* @__PURE__ */ y.createContext(void 0);
function Mi(n) {
  const o = y.useContext(iS);
  if (o === void 0 && !n)
    throw new Error(Mt(72));
  return o;
}
const tA = {
  ...Qu,
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
class ug extends Ti {
  constructor(o, a, i = !1) {
    const c = new sa(), f = {
      ...nA(),
      ...o
    };
    f.floatingRootContext = Kp(c, a, i), super(f, {
      popupRef: /* @__PURE__ */ y.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerElements: c
    }, tA);
  }
  setOpen = (o, a) => {
    GC(this, o, a, {
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
    return Gp(o, (c, f) => new ug(a, c, f)).store;
  }
}
function nA() {
  return {
    ...Ku(),
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
const lA = Pp(function(o) {
  const {
    disabled: a = !1,
    defaultOpen: i = !1,
    open: c,
    disableHoverablePopup: f = !1,
    trackCursorAxis: p = "none",
    actionsRef: g,
    onOpenChange: m,
    onOpenChangeComplete: d,
    handle: v,
    triggerId: b,
    defaultTriggerId: x = null,
    children: R
  } = o, w = ug.useStore(v?.store, {
    open: i,
    openProp: c,
    activeTriggerId: x,
    triggerIdProp: b
  });
  Xp(w, c, i, x), w.useControlledProp("openProp", c), w.useControlledProp("triggerIdProp", b), w.useContextCallback("onOpenChange", m), w.useContextCallback("onOpenChangeComplete", d);
  const D = w.useState("open"), T = !a && D, N = w.useState("activeTriggerId"), A = w.useState("mounted"), E = w.useState("payload");
  w.useSyncedValues({
    trackCursorAxis: p,
    disableHoverablePopup: f
  }), w.useSyncedValue("disabled", a), qu(w, {
    closeOnActiveTriggerUnmount: !0
  });
  const {
    forceUnmount: z,
    transitionStatus: U
  } = Xu(T, w), j = w.useState("isInstantPhase"), O = w.useState("instantType"), k = w.useState("lastOpenChangeReason"), G = y.useRef(null);
  xe(() => {
    D && a && w.setOpen(!1, Ye(oR));
  }, [D, a, w]), xe(() => {
    U === "ending" && k === zo || U !== "ending" && j ? (O !== "delay" && (G.current = O), w.set("instantType", "delay")) : G.current !== null && (w.set("instantType", G.current), G.current = null);
  }, [U, j, k, O, w]), xe(() => {
    T && N == null && w.set("payload", void 0);
  }, [w, N, T]);
  const P = y.useCallback(() => {
    w.setOpen(!1, Ye(Hu));
  }, [w]);
  y.useImperativeHandle(g, () => ({
    unmount: z,
    close: P
  }), [z, P]);
  const ne = T || A || !a && p !== "none";
  return /* @__PURE__ */ S.jsxs(iS.Provider, {
    value: w,
    children: [ne && /* @__PURE__ */ S.jsx(oA, {
      store: w,
      disabled: a,
      trackCursorAxis: p
    }), typeof R == "function" ? R({
      payload: E
    }) : R]
  });
});
function oA({
  store: n,
  disabled: o,
  trackCursorAxis: a
}) {
  const i = n.useState("floatingRootContext"), c = Ei(i, {
    enabled: !o,
    referencePress: () => n.select("closeOnClick")
  }), f = IR(i, {
    enabled: !o && a !== "none",
    axis: a === "none" ? void 0 : a
  }), p = y.useMemo(() => bn(f.reference, c.reference), [f.reference, c.reference]), g = y.useMemo(() => bn(f.trigger, c.trigger), [f.trigger, c.trigger]), m = y.useMemo(() => bn(ia, f.floating, c.floating), [f.floating, c.floating]);
  return Fu(n, {
    activeTriggerProps: p,
    inactiveTriggerProps: g,
    popupProps: m
  }), null;
}
const sS = /* @__PURE__ */ y.createContext(void 0);
function rA() {
  return y.useContext(sS);
}
let aA = (function(n) {
  return n[n.popupOpen = wu.popupOpen] = "popupOpen", n.triggerDisabled = "data-trigger-disabled", n;
})({});
const iA = 600, uS = "data-base-ui-tooltip-trigger";
function vb(n) {
  if ("composedPath" in n) {
    const a = n.composedPath();
    for (let i = 0; i < a.length; i += 1) {
      const c = a[i];
      if ($e(c))
        return c;
    }
  }
  const o = n.target;
  return $e(o) ? o : null;
}
function sA(n) {
  let o = n;
  for (; o; ) {
    if (o.hasAttribute(uS))
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
const uA = Y0(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    handle: p,
    payload: g,
    disabled: m,
    delay: d,
    closeOnClick: v = !0,
    closeDelay: b,
    id: x,
    ...R
  } = o, w = Mi(!0), D = p?.store ?? w;
  if (!D)
    throw new Error(Mt(82));
  const T = Bn(x), N = D.useState("isTriggerActive", T), A = D.useState("isOpenedByTrigger", T), E = D.useState("floatingRootContext"), z = y.useRef(null), U = d ?? iA, j = b ?? 0, {
    registerTrigger: O,
    isMountedByThisTrigger: k
  } = Fp(T, z, D, {
    payload: g,
    closeOnClick: v,
    closeDelay: j
  }), G = rA(), {
    delayRef: P,
    isInstantPhase: ne,
    hasProvider: K
  } = sR(E, {
    open: A
  }), Q = Jp(E);
  D.useSyncedValue("isInstantPhase", ne);
  const Z = D.useState("disabled"), q = m ?? Z, _ = Yt(q), Y = D.useState("trackCursorAxis"), B = D.useState("disableHoverablePopup"), F = y.useRef(!1), I = an(), M = y.useRef(void 0);
  function H() {
    const fe = G?.delay, ye = typeof P.current == "object" ? P.current.open : void 0;
    let Re = U;
    return K && (ye !== 0 ? Re = d ?? fe ?? U : Re = 0), Re;
  }
  function te(fe) {
    const ye = z.current;
    if (!ye || !fe)
      return !1;
    const Re = sA(fe);
    return Re !== null && Re !== ye && Le(ye, Re);
  }
  function J(fe) {
    const ye = te(fe);
    return F.current = ye, ye && (Q.openChangeTimeout.clear(), Q.restTimeout.clear(), Q.restTimeoutPending = !1, I.clear()), ye;
  }
  const re = Zu(E, {
    enabled: !q,
    mouseOnly: !0,
    move: !1,
    handleClose: !B && Y !== "both" ? $u() : null,
    restMs: H,
    delay() {
      const fe = typeof P.current == "object" ? P.current.close : void 0;
      let ye = j;
      return b == null && K && (ye = fe), {
        close: ye
      };
    },
    triggerElementRef: z,
    isActiveTrigger: N,
    isClosing: () => D.select("transitionStatus") === "ending",
    shouldOpen() {
      return !F.current;
    }
  }), ie = J0(E, {
    enabled: !q
  }).reference, oe = (fe) => {
    const ye = F.current, Re = vb(fe), _e = J(Re), ke = z.current, we = ke && Re && Le(ke, Re);
    if (_e && D.select("open") && D.select("lastOpenChangeReason") === Pt) {
      D.setOpen(!1, Ye(Pt, fe));
      return;
    }
    if (ye && !_e && we && !_.current && !D.select("open") && ke && // Match the hover hook's non-strict mouse fallback for mouse-only event sequences.
    or(M.current)) {
      const Ce = () => {
        !F.current && !_.current && !D.select("open") && D.setOpen(!0, Ye(Pt, fe, ke));
      }, he = H();
      he === 0 ? (I.clear(), Ce()) : I.start(he, Ce);
    }
  }, se = D.useState("triggerProps", k);
  return nt("button", o, {
    state: {
      open: A
    },
    ref: [a, O, z],
    props: [re, ie, k || Y !== "none" ? se : void 0, {
      onMouseOver(fe) {
        oe(fe.nativeEvent);
      },
      onFocus(fe) {
        te(vb(fe.nativeEvent)) && fe.preventBaseUIHandler();
      },
      onMouseLeave() {
        F.current = !1, I.clear(), M.current = void 0;
      },
      onPointerEnter(fe) {
        M.current = fe.pointerType;
      },
      onPointerDown(fe) {
        M.current = fe.pointerType, D.set("closeOnClick", v), v && !D.select("open") && D.cancelPendingOpen(fe.nativeEvent);
      },
      onClick(fe) {
        v && !D.select("open") && D.cancelPendingOpen(fe.nativeEvent);
      },
      id: T,
      [aA.triggerDisabled]: q ? "" : void 0,
      [uS]: q ? void 0 : ""
    }, R],
    stateAttributesMapping: Wu
  });
}), cS = /* @__PURE__ */ y.createContext(void 0);
function cA() {
  const n = y.useContext(cS);
  if (n === void 0)
    throw new Error(Mt(70));
  return n;
}
const fA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    children: i,
    container: c,
    className: f,
    render: p,
    style: g,
    ...m
  } = o, {
    portalNode: d,
    portalSubtree: v
  } = O0({
    container: c,
    ref: a,
    componentProps: o,
    elementProps: m
  });
  return !v && !d ? null : /* @__PURE__ */ S.jsxs(y.Fragment, {
    children: [v, d && /* @__PURE__ */ gl.createPortal(i, d)]
  });
}), dA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    keepMounted: i = !1,
    ...c
  } = o;
  return Mi().useState("mounted") || i ? /* @__PURE__ */ S.jsx(cS.Provider, {
    value: i,
    children: /* @__PURE__ */ S.jsx(fA, {
      ref: a,
      ...c
    })
  }) : null;
}), fS = /* @__PURE__ */ y.createContext(void 0);
function dS() {
  const n = y.useContext(fS);
  if (n === void 0)
    throw new Error(Mt(71));
  return n;
}
const pA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    anchor: f,
    positionMethod: p = "absolute",
    side: g = "top",
    align: m = "center",
    sideOffset: d = 0,
    alignOffset: v = 0,
    collisionBoundary: b = "clipping-ancestors",
    collisionPadding: x = 5,
    arrowPadding: R = 5,
    sticky: w = !1,
    disableAnchorTracking: D = !1,
    collisionAvoidance: T = Up,
    style: N,
    ...A
  } = o, E = Mi(), z = cA(), U = E.useState("open"), j = E.useState("mounted"), O = E.useState("trackCursorAxis"), k = E.useState("disableHoverablePopup"), G = E.useState("floatingRootContext"), P = E.useState("instantType"), ne = E.useState("transitionStatus"), K = E.useState("hasViewport"), Q = sc({
    anchor: f,
    positionMethod: p,
    floatingRootContext: G,
    mounted: j,
    side: g,
    sideOffset: d,
    align: m,
    alignOffset: v,
    collisionBoundary: b,
    collisionPadding: x,
    sticky: w,
    arrowPadding: R,
    disableAnchorTracking: D,
    keepMounted: z,
    collisionAvoidance: T,
    adaptiveOrigin: K ? tg : void 0
  }), Z = y.useMemo(() => ({
    open: U,
    side: Q.side,
    align: Q.align,
    anchorHidden: Q.anchorHidden,
    instant: O !== "none" ? "tracking-cursor" : P
  }), [U, Q.side, Q.align, Q.anchorHidden, O, P]), q = uc(o, Z, {
    styles: Q.positionerStyles,
    transitionStatus: ne,
    props: A,
    refs: [a, E.useStateSetter("positionerElement")],
    hidden: !j,
    inert: !U || O === "both" || k
  });
  return /* @__PURE__ */ S.jsx(fS.Provider, {
    value: Q,
    children: q
  });
}), gA = {
  ...ko,
  ...jo
}, mA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = o, g = Mi(), {
    side: m,
    align: d
  } = dS(), v = g.useState("open"), b = g.useState("instantType"), x = g.useState("transitionStatus"), R = g.useState("popupProps"), w = g.useState("floatingRootContext"), D = g.useState("disabled"), T = g.useState("closeDelay");
  Ql({
    open: v,
    ref: g.context.popupRef,
    onComplete() {
      v && g.context.onOpenChangeComplete?.(!0);
    }
  }), $p(w, {
    enabled: !D,
    closeDelay: T
  });
  const N = g.useStateSetter("popupElement");
  return nt("div", o, {
    state: {
      open: v,
      side: m,
      align: d,
      instant: b,
      transitionStatus: x
    },
    ref: [a, g.context.popupRef, N],
    props: [R, Oi(x), p],
    stateAttributesMapping: gA
  });
}), hA = /* @__PURE__ */ y.forwardRef(function(o, a) {
  const {
    render: i,
    className: c,
    style: f,
    ...p
  } = o, g = Mi(), {
    arrowRef: m,
    side: d,
    align: v,
    arrowUncentered: b,
    arrowStyles: x
  } = dS(), R = g.useState("open"), w = g.useState("instantType");
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
      style: x,
      "aria-hidden": !0
    }, p],
    stateAttributesMapping: ko
  });
}), yA = function(o) {
  const {
    delay: a,
    closeDelay: i,
    timeout: c = 400
  } = o, f = y.useMemo(() => ({
    delay: a,
    closeDelay: i
  }), [a, i]), p = y.useMemo(() => ({
    open: a,
    close: i
  }), [a, i]);
  return /* @__PURE__ */ S.jsx(sS.Provider, {
    value: f,
    children: /* @__PURE__ */ S.jsx(iR, {
      delay: p,
      timeoutMs: c,
      children: o.children
    })
  });
};
function vA({
  delay: n = 0,
  ...o
}) {
  return /* @__PURE__ */ S.jsx(
    yA,
    {
      "data-slot": "tooltip-provider",
      delay: n,
      ...o
    }
  );
}
function bA({ ...n }) {
  return /* @__PURE__ */ S.jsx(lA, { "data-slot": "tooltip", ...n });
}
function xA({ ...n }) {
  return /* @__PURE__ */ S.jsx(uA, { "data-slot": "tooltip-trigger", ...n });
}
function SA({
  className: n,
  side: o = "top",
  sideOffset: a = 4,
  align: i = "center",
  alignOffset: c = 0,
  children: f,
  ...p
}) {
  return /* @__PURE__ */ S.jsx(dA, { children: /* @__PURE__ */ S.jsx(
    pA,
    {
      align: i,
      alignOffset: c,
      side: o,
      sideOffset: a,
      className: "tw:isolate tw:z-[var(--z-popover)]",
      children: /* @__PURE__ */ S.jsxs(
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
            /* @__PURE__ */ S.jsx(hA, { className: "tw:size-2.5 tw:translate-y-[calc(-50%-2px)] tw:rotate-45 tw:rounded-[2px] tw:bg-foreground tw:fill-foreground tw:data-[side=bottom]:top-1 tw:data-[side=inline-end]:top-1/2! tw:data-[side=inline-end]:-left-1 tw:data-[side=inline-end]:-translate-y-1/2 tw:data-[side=inline-start]:top-1/2! tw:data-[side=inline-start]:-right-1 tw:data-[side=inline-start]:-translate-y-1/2 tw:data-[side=left]:top-1/2! tw:data-[side=left]:-right-1 tw:data-[side=left]:-translate-y-1/2 tw:data-[side=right]:top-1/2! tw:data-[side=right]:-left-1 tw:data-[side=right]:-translate-y-1/2 tw:data-[side=top]:-bottom-2.5" })
          ]
        }
      )
    }
  ) });
}
const pS = 420;
function wA(n) {
  const [o, a] = n.split("-");
  return { side: o, align: a ?? "center" };
}
function EA({ children: n }) {
  return /* @__PURE__ */ S.jsx(vA, { delay: pS, closeDelay: 0, children: n });
}
function Kd(n) {
  const { label: o, children: a, placement: i = "top" } = n, c = Qd.useId(), [f, p] = Qd.useState(!1);
  return /* @__PURE__ */ S.jsxs(bA, { open: f, onOpenChange: p, children: [
    /* @__PURE__ */ S.jsx(
      xA,
      {
        delay: pS,
        closeDelay: 0,
        "aria-describedby": f ? c : void 0,
        onBlur: () => p(!1),
        onMouseLeave: () => p(!1),
        render: a
      }
    ),
    /* @__PURE__ */ S.jsx(SA, { id: c, role: "tooltip", ...wA(i), className: "ui-tooltip open", children: o })
  ] });
}
const vt = (n) => document.getElementById(n);
function Zr(n) {
  vt(n)?.click();
}
function gS(n) {
  const o = vt(n);
  return o ? [...o.options].map((a) => ({ value: a.value, label: a.text })) : [];
}
function mS(n, o) {
  const a = vt(n);
  a && (a.value = o, a.dispatchEvent(new Event("change", { bubbles: !0 })));
}
function ou(n, o) {
  return [...document.querySelectorAll(`#${n} ${o}`)].map((a, i) => ({
    key: a.dataset.pick ?? a.dataset.wfpick ?? a.dataset.rec ?? a.dataset.cat ?? a.dataset.fmt ?? String(i),
    label: (a instanceof HTMLInputElement ? a.closest("label")?.textContent : a.textContent)?.replace(/\s+/g, " ").trim() || "Option",
    active: a instanceof HTMLInputElement && a.checked || a.classList.contains("on") || a.closest(".mi")?.classList.contains("on") === !0,
    element: a
  }));
}
const bb = /* @__PURE__ */ new Set(["png", "jpg", "svg", "mp4", "pdf", "html", "docx", "xlsx", "csv", "md"]);
function mp(n) {
  return n.replace(/\s+\d+$/, "").trim();
}
function xb(n) {
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
  return [...document.querySelectorAll("#activeChips [data-fx]")].map((o) => {
    const a = o.dataset.fx ?? "filter";
    let i = o.parentElement?.textContent?.replace("×", "").trim() || "Filter";
    return a === "fmt" && n?.summary ? i = n.summary : i = i.replace(/^(Formats|Status|Folder|Collection):\s*/, ""), { key: a, label: i, remove: o };
  });
}
function RA({
  state: n,
  folder: o,
  collectionItems: a,
  workflowItems: i,
  onClose: c
}) {
  const [f, p] = y.useState(""), [g, m] = y.useState(!1), [d, v] = y.useState(!1), [b, x] = y.useState(""), R = window.__galleryFileTypes, w = n.types.filter((O) => O.active).map((O) => O.key), D = n.pinned.map((O) => n.types.find((k) => k.key === O)).filter((O) => !!O), T = D.filter((O) => bb.has(O.key)), N = D.filter((O) => !bb.has(O.key)), A = n.types.filter((O) => {
    const k = f.trim().toLowerCase();
    return !k || O.key.includes(k) || O.label.toLowerCase().includes(k);
  }), E = gS("folder").map((O) => ({
    value: O.value,
    label: O.value ? O.label : "All folders"
  })), z = (O, k) => {
    const G = new Set(O);
    R?.setActive([...w.filter((P) => !G.has(P)), ...k]);
  }, U = () => {
    const O = b.trim();
    O && (R?.savePreset(O), x(""), v(!1));
  };
  if (g)
    return /* @__PURE__ */ S.jsxs(S.Fragment, { children: [
      /* @__PURE__ */ S.jsxs(fb, { className: "gallery-filter-panel-head", children: [
        /* @__PURE__ */ S.jsx(db, { className: "tw:sr-only", children: "File types" }),
        /* @__PURE__ */ S.jsx(pb, { className: "tw:sr-only", children: "Customize quick file types for this project" }),
        /* @__PURE__ */ S.jsxs("div", { children: [
          /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-panel-title", children: "Customize Quick Types" }),
          /* @__PURE__ */ S.jsxs("div", { className: "gallery-filter-helper", children: [
            "Saved for ",
            n.projectName
          ] })
        ] }),
        /* @__PURE__ */ S.jsx(_t, { variant: "ghost", size: "sm", onClick: () => m(!1), children: "Done" })
      ] }),
      /* @__PURE__ */ S.jsx(Qr, {}),
      /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-scroll", children: /* @__PURE__ */ S.jsxs("div", { className: "gallery-filter-section", children: [
        /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-section-label", children: "Choose pinned types" }),
        /* @__PURE__ */ S.jsx(
          Xd,
          {
            multiple: !0,
            value: n.pinned,
            onValueChange: (O) => R?.setPinned(O),
            className: "gallery-type-customize-grid",
            "aria-label": "Quick file types for this project",
            children: n.types.map((O) => /* @__PURE__ */ S.jsxs(
              Fd,
              {
                value: O.key,
                variant: "outline",
                size: "sm",
                "data-gallery-customize-type": O.key,
                children: [
                  /* @__PURE__ */ S.jsx(Zd, { "data-icon": "inline-start" }),
                  O.label
                ]
              },
              O.key
            ))
          }
        )
      ] }) })
    ] });
  const j = (O, k) => {
    if (!k.length) return null;
    const G = k.map((P) => P.key);
    return /* @__PURE__ */ S.jsxs("div", { className: "gallery-type-group", children: [
      /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-sub-label", children: O }),
      /* @__PURE__ */ S.jsx(
        Xd,
        {
          multiple: !0,
          value: w.filter((P) => G.includes(P)),
          onValueChange: (P) => z(G, P),
          className: "gallery-quick-types",
          "aria-label": `${O.toLowerCase()} file types`,
          children: k.map((P) => /* @__PURE__ */ S.jsxs(
            Fd,
            {
              value: P.key,
              variant: "outline",
              size: "sm",
              "data-gallery-quick-type": P.key,
              children: [
                P.active && /* @__PURE__ */ S.jsx(cu, { "data-icon": "inline-start" }),
                P.label
              ]
            },
            P.key
          ))
        }
      )
    ] });
  };
  return /* @__PURE__ */ S.jsxs(S.Fragment, { children: [
    /* @__PURE__ */ S.jsxs(fb, { className: "gallery-filter-panel-head", children: [
      /* @__PURE__ */ S.jsxs("div", { children: [
        /* @__PURE__ */ S.jsx(db, { className: "gallery-filter-panel-title", children: "File types" }),
        /* @__PURE__ */ S.jsx(pb, { className: "tw:sr-only", children: "Filter and customize file types for this project" })
      ] }),
      /* @__PURE__ */ S.jsx(_t, { variant: "ghost", size: "icon-sm", "aria-label": "Close file type filters", onClick: c, children: /* @__PURE__ */ S.jsx(gi, {}) })
    ] }),
    /* @__PURE__ */ S.jsx(Qr, {}),
    /* @__PURE__ */ S.jsxs("div", { className: "gallery-filter-scroll", "data-gallery-file-type-panel": !0, children: [
      /* @__PURE__ */ S.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "quick-types-heading", children: [
        /* @__PURE__ */ S.jsxs("div", { className: "gallery-filter-section-heading", children: [
          /* @__PURE__ */ S.jsxs("div", { children: [
            /* @__PURE__ */ S.jsx("div", { id: "quick-types-heading", className: "gallery-filter-section-label", children: "Quick Types" }),
            /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-helper", children: "Pinned for this project" })
          ] }),
          /* @__PURE__ */ S.jsxs(_t, { variant: "ghost", size: "xs", onClick: () => m(!0), children: [
            /* @__PURE__ */ S.jsx(Cb, { "data-icon": "inline-start" }),
            "Customize"
          ] })
        ] }),
        j("Outputs", T),
        j("Sources", N)
      ] }),
      /* @__PURE__ */ S.jsx(Qr, {}),
      /* @__PURE__ */ S.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "project-presets-heading", children: [
        /* @__PURE__ */ S.jsxs("div", { children: [
          /* @__PURE__ */ S.jsx("div", { id: "project-presets-heading", className: "gallery-filter-section-label", children: "Project Presets" }),
          /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-helper", children: "Saved only in this project" })
        ] }),
        /* @__PURE__ */ S.jsxs("div", { className: "gallery-project-presets", children: [
          n.presets.map((O) => /* @__PURE__ */ S.jsxs("div", { className: "gallery-project-preset", children: [
            /* @__PURE__ */ S.jsx(
              _t,
              {
                variant: O.active ? "secondary" : "outline",
                size: "sm",
                "data-gallery-file-preset": O.id,
                onClick: () => R?.applyPreset(O.id),
                children: O.label
              }
            ),
            O.custom && /* @__PURE__ */ S.jsx(
              _t,
              {
                variant: "ghost",
                size: "icon-xs",
                "aria-label": `Delete preset ${O.label}`,
                onClick: () => R?.removePreset(O.id),
                children: /* @__PURE__ */ S.jsx(gi, {})
              }
            )
          ] }, O.id)),
          /* @__PURE__ */ S.jsxs(_t, { variant: "outline", size: "sm", "data-gallery-new-preset": !0, onClick: () => v(!0), children: [
            /* @__PURE__ */ S.jsx(rE, { "data-icon": "inline-start" }),
            "New preset"
          ] })
        ] }),
        d && /* @__PURE__ */ S.jsxs(cp, { "data-gallery-preset-form": !0, children: [
          /* @__PURE__ */ S.jsx(
            dp,
            {
              "aria-label": "New preset name",
              placeholder: "Preset name…",
              value: b,
              onChange: (O) => x(O.target.value),
              onKeyDown: (O) => {
                O.key === "Enter" && (O.preventDefault(), U()), O.key === "Escape" && (O.stopPropagation(), v(!1));
              },
              autoFocus: !0
            }
          ),
          /* @__PURE__ */ S.jsx(fp, { align: "inline-end", children: /* @__PURE__ */ S.jsx(_M, { onClick: U, disabled: !b.trim(), children: "Save" }) })
        ] })
      ] }),
      /* @__PURE__ */ S.jsx(Qr, {}),
      /* @__PURE__ */ S.jsxs("section", { className: "gallery-filter-section", "aria-labelledby": "all-file-types-heading", children: [
        /* @__PURE__ */ S.jsx("div", { id: "all-file-types-heading", className: "gallery-filter-section-label", children: "All File Types" }),
        /* @__PURE__ */ S.jsxs(cp, { children: [
          /* @__PURE__ */ S.jsx(
            dp,
            {
              "aria-label": "Search file types",
              placeholder: "Search extension or language…",
              value: f,
              onChange: (O) => p(O.target.value)
            }
          ),
          /* @__PURE__ */ S.jsx(fp, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ S.jsx(Rb, {}) })
        ] }),
        /* @__PURE__ */ S.jsx("div", { className: "gallery-all-types", role: "list", "aria-label": "All file types", children: A.map((O) => /* @__PURE__ */ S.jsxs("div", { className: "gallery-all-type-row", role: "listitem", children: [
          /* @__PURE__ */ S.jsxs(
            _t,
            {
              variant: "ghost",
              size: "sm",
              "data-gallery-file-type": O.key,
              "aria-pressed": O.active,
              onClick: () => z([O.key], O.active ? [] : [O.key]),
              children: [
                O.active && /* @__PURE__ */ S.jsx(cu, { "data-icon": "inline-start" }),
                O.label
              ]
            }
          ),
          /* @__PURE__ */ S.jsx(
            _t,
            {
              variant: "ghost",
              size: "icon-sm",
              "aria-label": `${O.pinned ? "Unpin" : "Pin"} ${O.label} for this project`,
              "aria-pressed": O.pinned,
              "data-gallery-pin-type": O.key,
              onClick: () => R?.setPinned(O.pinned ? n.pinned.filter((k) => k !== O.key) : [...n.pinned, O.key]),
              children: /* @__PURE__ */ S.jsx(Zd, {})
            }
          )
        ] }, O.key)) })
      ] }),
      /* @__PURE__ */ S.jsx(Qr, {}),
      /* @__PURE__ */ S.jsxs("section", { className: "gallery-filter-section gallery-other-filters", "aria-labelledby": "other-filters-heading", children: [
        /* @__PURE__ */ S.jsx("div", { id: "other-filters-heading", className: "gallery-filter-section-label", children: "Other Filters" }),
        /* @__PURE__ */ S.jsxs("div", { className: "gallery-other-filter-row", children: [
          /* @__PURE__ */ S.jsx(Z1, { "aria-hidden": "true" }),
          /* @__PURE__ */ S.jsxs(
            eS,
            {
              items: E,
              modal: !1,
              value: o?.value ?? "",
              onValueChange: (O) => mS("folder", O ?? ""),
              children: [
                /* @__PURE__ */ S.jsx(lS, { size: "sm", "aria-label": "Filter by folder", children: /* @__PURE__ */ S.jsx(nS, {}) }),
                /* @__PURE__ */ S.jsx(oS, { children: /* @__PURE__ */ S.jsx(tS, { children: E.map((O) => /* @__PURE__ */ S.jsx(rS, { value: O.value, children: O.label }, O.value || "all")) }) })
              ]
            }
          )
        ] }),
        i.length > 0 && /* @__PURE__ */ S.jsxs("div", { className: "gallery-type-group", children: [
          /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-sub-label", children: "Status" }),
          /* @__PURE__ */ S.jsx(
            Xd,
            {
              value: i.filter((O) => O.active).map((O) => O.key),
              onValueChange: (O) => {
                const k = O.at(-1) ?? "";
                i.find((G) => G.key === k)?.element.click();
              },
              className: "gallery-workflow-types",
              "aria-label": "Workflow status",
              children: i.filter((O) => O.key).map((O) => /* @__PURE__ */ S.jsx(Fd, { value: O.key, variant: "outline", size: "sm", "data-gallery-status": O.key, children: mp(O.label) }, O.key))
            }
          )
        ] }),
        a.length > 0 && /* @__PURE__ */ S.jsxs("div", { className: "gallery-type-group", children: [
          /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-sub-label", children: "Collections" }),
          /* @__PURE__ */ S.jsx("div", { className: "gallery-collection-filters", children: a.map((O) => /* @__PURE__ */ S.jsx(_t, { variant: O.active ? "secondary" : "outline", size: "sm", onClick: () => O.element.click(), children: mp(O.label) }, O.key)) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ S.jsx(Qr, {}),
    /* @__PURE__ */ S.jsx("div", { className: "gallery-filter-panel-foot", children: /* @__PURE__ */ S.jsxs(_t, { variant: "ghost", size: "sm", onClick: () => R?.resetFilters(), children: [
      /* @__PURE__ */ S.jsx(uE, { "data-icon": "inline-start" }),
      "Reset filters"
    ] }) })
  ] });
}
function CA(n) {
  const o = n.message.match(/^Move to Trash\?\s+(.+)$/);
  if (o) {
    const i = o[1], c = i.split("/"), f = c.pop() || i, p = c.join("/");
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
  const [, n] = y.useReducer((E) => E + 1, 0), [o, a] = y.useState(!1), i = vt("q")?.value ?? "", c = vt("sort"), f = vt("folder"), p = vt("favChip"), g = vt("rescan")?.classList.contains("spinning") === !0, m = vt("densitySeg")?.querySelector("button.on")?.dataset.d ?? "m", d = ou("collMenu", "[data-pick]"), v = ou("wfMenu", "[data-wfpick]"), b = ou("recMenu", "[data-rec]"), x = window.__galleryFileTypes?.getState() ?? {
    projectName: "this project",
    types: ou("fmtMenu", "input[data-fmt]").map((E) => ({
      key: E.key,
      label: mp(E.label),
      active: E.active,
      pinned: !1
    })),
    pinned: [],
    presets: [],
    summary: "File types"
  }, R = window.__gallerySelection?.getState() ?? { rels: [], imageCount: 0 }, w = TA(x), D = document.querySelectorAll("#activeChips [data-fx]").length, T = p?.classList.contains("on") === !0, N = gS("sort").map((E) => ({ value: E.value, label: xb(E.value) }));
  y.useEffect(() => {
    const E = () => n(), z = new MutationObserver(E);
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
    ].filter((O) => !!O).forEach((O) => z.observe(O, {
      attributes: !0,
      childList: !0,
      characterData: !0,
      subtree: !0
    }));
    const j = [vt("q"), vt("sort"), vt("folder")].filter((O) => !!O);
    return j.forEach((O) => {
      O.addEventListener("input", E), O.addEventListener("change", E);
    }), window.addEventListener("atelier-gallery-file-types-change", E), window.addEventListener("atelier-gallery-selection-change", E), document.documentElement.classList.add("gallery-react-mounted"), document.documentElement.dataset.galleryUi = "shadcn-react-v1", () => {
      z.disconnect(), j.forEach((O) => {
        O.removeEventListener("input", E), O.removeEventListener("change", E);
      }), window.removeEventListener("atelier-gallery-file-types-change", E), window.removeEventListener("atelier-gallery-selection-change", E), document.documentElement.classList.remove("gallery-react-mounted");
    };
  }, []), y.useEffect(() => {
    R.rels.length && a(!1);
  }, [R.rels.length]);
  const A = (E) => {
    const z = vt("q");
    z && (z.value = E, z.dispatchEvent(new Event("input", { bubbles: !0 })));
  };
  if (R.rels.length) {
    const E = window.__gallerySelection;
    return /* @__PURE__ */ S.jsxs("div", { className: "gallery-command-bar gallery-selection-command-bar", role: "toolbar", "aria-label": "Selected files actions", "data-gallery-toolbar-state": "selection", children: [
      /* @__PURE__ */ S.jsxs("div", { className: "gallery-selection-count", "aria-live": "polite", children: [
        /* @__PURE__ */ S.jsx(pE, { "aria-hidden": "true" }),
        /* @__PURE__ */ S.jsxs("span", { children: [
          R.rels.length,
          " selected"
        ] })
      ] }),
      /* @__PURE__ */ S.jsx("div", { className: "gallery-command-spacer" }),
      R.rels.length === 1 && /* @__PURE__ */ S.jsx(_t, { variant: "outline", size: "sm", "data-gallery-selection-action": "open", onClick: () => E?.open(), children: "Open" }),
      R.imageCount >= 2 && /* @__PURE__ */ S.jsx(_t, { variant: "outline", size: "sm", "data-gallery-selection-action": "compare", onClick: () => E?.compare(), children: "Compare" }),
      /* @__PURE__ */ S.jsx(_t, { variant: "outline", size: "sm", "data-gallery-selection-action": "collect", onClick: (z) => {
        z.stopPropagation(), E?.collect(z.currentTarget);
      }, children: "Collect" }),
      /* @__PURE__ */ S.jsxs(_t, { variant: "outline", size: "sm", "data-gallery-selection-action": "export", onClick: (z) => {
        z.stopPropagation(), E?.export(z.currentTarget);
      }, children: [
        "Export ",
        /* @__PURE__ */ S.jsx(Tb, { "data-icon": "inline-end" })
      ] }),
      /* @__PURE__ */ S.jsxs(Yd, { modal: !1, children: [
        /* @__PURE__ */ S.jsx(Gd, { render: /* @__PURE__ */ S.jsx(_t, { variant: "ghost", size: "icon-sm", "aria-label": "More selection actions", children: /* @__PURE__ */ S.jsx(fv, {}) }) }),
        /* @__PURE__ */ S.jsxs(uu, { align: "end", className: "tw:w-48", children: [
          /* @__PURE__ */ S.jsx(er, { children: /* @__PURE__ */ S.jsx(tr, { onClick: () => E?.hide(), children: "Hide selected" }) }),
          /* @__PURE__ */ S.jsx(qd, {}),
          /* @__PURE__ */ S.jsx(er, { children: /* @__PURE__ */ S.jsxs(tr, { variant: "destructive", onClick: () => E?.delete(), children: [
            /* @__PURE__ */ S.jsx(Ob, { "data-icon": "inline-start" }),
            " Move to Trash"
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ S.jsx(Kd, { label: "Clear selection (Esc)", children: /* @__PURE__ */ S.jsx(_t, { variant: "ghost", size: "icon-sm", "aria-label": "Clear selection", "data-gallery-selection-action": "clear", onClick: () => E?.clear(), children: /* @__PURE__ */ S.jsx(gi, {}) }) })
    ] });
  }
  return /* @__PURE__ */ S.jsxs("div", { className: "gallery-command-bar", role: "toolbar", "aria-label": "Gallery commands", "data-gallery-toolbar-state": "normal", children: [
    /* @__PURE__ */ S.jsxs(cp, { className: "gallery-command-search", "data-gallery-command-group": "search", children: [
      /* @__PURE__ */ S.jsx(
        dp,
        {
          "aria-label": "Search project files",
          "data-gallery-command": "search",
          placeholder: "Search by name or folder…",
          value: i,
          onChange: (E) => A(E.target.value)
        }
      ),
      /* @__PURE__ */ S.jsx(fp, { align: "inline-start", "aria-hidden": "true", children: /* @__PURE__ */ S.jsx(Rb, {}) })
    ] }),
    /* @__PURE__ */ S.jsxs(WM, { open: o, onOpenChange: a, children: [
      /* @__PURE__ */ S.jsx(
        e2,
        {
          render: /* @__PURE__ */ S.jsxs(_t, { variant: D ? "secondary" : "outline", size: "sm", children: [
            /* @__PURE__ */ S.jsx($1, { "data-icon": "inline-start" }),
            /* @__PURE__ */ S.jsxs("span", { "data-gallery-command": "filters", children: [
              "Filters",
              D ? ` ${D}` : ""
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ S.jsx(t2, { align: "start", sideOffset: 6, className: "gallery-filter-popover tw:w-[min(400px,calc(100vw-24px))] tw:gap-0 tw:p-0", children: /* @__PURE__ */ S.jsx(
        RA,
        {
          state: x,
          folder: f,
          collectionItems: d,
          workflowItems: v,
          onClose: () => a(!1)
        }
      ) })
    ] }),
    /* @__PURE__ */ S.jsx(Kd, { label: "Favorites", children: /* @__PURE__ */ S.jsx(
      _t,
      {
        variant: T ? "secondary" : "outline",
        size: "icon-sm",
        "data-gallery-command": "favorites",
        "aria-label": "Favorites",
        "aria-pressed": T,
        onClick: () => Zr("favChip"),
        children: /* @__PURE__ */ S.jsx(Zd, {})
      }
    ) }),
    /* @__PURE__ */ S.jsx("div", { className: "gallery-active-filters", "aria-label": "Active filters", children: w.map((E) => /* @__PURE__ */ S.jsxs(
      _t,
      {
        variant: "outline",
        size: "xs",
        className: "gallery-filter-chip",
        "data-gallery-filter-chip": E.key,
        "aria-label": `Remove filter ${E.label}`,
        onClick: () => E.remove.click(),
        children: [
          E.label,
          /* @__PURE__ */ S.jsx(gi, { "data-icon": "inline-end" })
        ]
      },
      E.key
    )) }),
    /* @__PURE__ */ S.jsx("div", { className: "gallery-command-spacer" }),
    /* @__PURE__ */ S.jsxs(eS, { items: N, modal: !1, value: c?.value ?? "mtime", onValueChange: (E) => E && mS("sort", E), children: [
      /* @__PURE__ */ S.jsx(lS, { size: "sm", className: "gallery-command-select gallery-command-sort", "aria-label": "Sort project files", children: /* @__PURE__ */ S.jsx(nS, { children: (E) => xb(String(E)) }) }),
      /* @__PURE__ */ S.jsx(oS, { children: /* @__PURE__ */ S.jsx(tS, { children: N.map((E) => /* @__PURE__ */ S.jsx(rS, { value: E.value, children: E.label }, E.value)) }) })
    ] }),
    /* @__PURE__ */ S.jsxs(Yd, { modal: !1, children: [
      /* @__PURE__ */ S.jsx(Gd, { render: /* @__PURE__ */ S.jsxs(_t, { variant: "outline", size: "sm", "aria-label": "View options", children: [
        /* @__PURE__ */ S.jsx(dv, { "data-icon": "inline-start" }),
        /* @__PURE__ */ S.jsx("span", { className: "gallery-view-label", children: "View" })
      ] }) }),
      /* @__PURE__ */ S.jsx(uu, { align: "end", className: "tw:w-44", children: /* @__PURE__ */ S.jsxs(er, { children: [
        /* @__PURE__ */ S.jsx(bM, { children: "Card size" }),
        [{ key: "s", label: "Compact" }, { key: "m", label: "Standard" }, { key: "l", label: "Large" }].map((E) => /* @__PURE__ */ S.jsx(
          EM,
          {
            checked: m === E.key,
            "data-gallery-density": E.key,
            onClick: () => vt("densitySeg")?.querySelector(`[data-d="${E.key}"]`)?.click(),
            children: E.label
          },
          E.key
        ))
      ] }) })
    ] }),
    /* @__PURE__ */ S.jsxs(Yd, { modal: !1, children: [
      /* @__PURE__ */ S.jsx(Kd, { label: "Gallery tools", children: /* @__PURE__ */ S.jsx(Gd, { render: /* @__PURE__ */ S.jsx(_t, { variant: "ghost", size: "icon-sm", "aria-label": "Gallery tools", children: /* @__PURE__ */ S.jsx(fv, {}) }) }) }),
      /* @__PURE__ */ S.jsxs(uu, { align: "end", className: "tw:w-48", children: [
        /* @__PURE__ */ S.jsxs(er, { children: [
          /* @__PURE__ */ S.jsxs(tr, { "data-gallery-command": "rescan", disabled: g, onClick: () => Zr("rescan"), children: [
            g ? /* @__PURE__ */ S.jsx(eA, { "data-icon": "inline-start" }) : /* @__PURE__ */ S.jsx(iE, { "data-icon": "inline-start" }),
            g ? "Rescanning…" : "Rescan project"
          ] }),
          /* @__PURE__ */ S.jsxs(tr, { onClick: () => Zr("viewChip"), children: [
            /* @__PURE__ */ S.jsx(Cb, { "data-icon": "inline-start" }),
            " Gallery settings…"
          ] })
        ] }),
        /* @__PURE__ */ S.jsx(qd, {}),
        /* @__PURE__ */ S.jsxs(er, { children: [
          /* @__PURE__ */ S.jsxs(tr, { onClick: () => Zr("boardChip"), children: [
            /* @__PURE__ */ S.jsx(dv, { "data-icon": "inline-start" }),
            " Board"
          ] }),
          /* @__PURE__ */ S.jsxs(tr, { onClick: () => Zr("notesChip"), children: [
            /* @__PURE__ */ S.jsx(lE, { "data-icon": "inline-start" }),
            " Notes"
          ] })
        ] }),
        b.length > 0 && /* @__PURE__ */ S.jsxs(S.Fragment, { children: [
          /* @__PURE__ */ S.jsx(qd, {}),
          /* @__PURE__ */ S.jsx(er, { children: /* @__PURE__ */ S.jsxs(xM, { children: [
            /* @__PURE__ */ S.jsx(SM, { children: "Recent files" }),
            /* @__PURE__ */ S.jsx(wM, { children: /* @__PURE__ */ S.jsx(er, { children: b.map((E) => /* @__PURE__ */ S.jsx(tr, { onClick: () => E.element.click(), children: E.label }, E.key)) }) })
          ] }) })
        ] })
      ] })
    ] })
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
  const c = n ? CA(n) : null;
  return /* @__PURE__ */ S.jsx(TO, { open: !!n, onOpenChange: (f) => {
    f || i(!1);
  }, children: /* @__PURE__ */ S.jsxs(OO, { children: [
    /* @__PURE__ */ S.jsxs(MO, { children: [
      c?.destructive && /* @__PURE__ */ S.jsx(NO, { variant: "destructive", children: /* @__PURE__ */ S.jsx(Ob, {}) }),
      /* @__PURE__ */ S.jsx(jO, { children: c?.title }),
      c?.description && /* @__PURE__ */ S.jsx(kO, { children: c.description })
    ] }),
    /* @__PURE__ */ S.jsxs(zO, { variant: "plain", children: [
      /* @__PURE__ */ S.jsx(HO, { variant: "ghost", onClick: () => i(!1), children: "Cancel" }),
      /* @__PURE__ */ S.jsx(
        _O,
        {
          variant: c?.destructive ? "destructive" : "default",
          "data-gallery-confirm": "accept",
          onClick: () => i(!0),
          children: c?.acceptLabel || "Delete"
        }
      )
    ] })
  ] }) });
}
function AA() {
  const [n, o] = y.useState(document.body.classList.contains("has-insp")), [a, i] = y.useState(() => window.matchMedia("(max-width: 800px)").matches), [c, f] = y.useState(vt("inspTitle")?.textContent || "Inspector"), p = y.useRef(vt("inspector")), g = y.useCallback((m) => {
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
  }, []), /* @__PURE__ */ S.jsx(
    _2,
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
      children: /* @__PURE__ */ S.jsxs(
        L2,
        {
          side: "right",
          layer: a ? "modal" : "panel",
          keepMounted: !0,
          showOverlay: a,
          className: "tw:gap-0 tw:p-0",
          style: { width: "300px", maxWidth: "calc(100vw - 16px)" },
          children: [
            /* @__PURE__ */ S.jsxs(I2, { className: "tw:border-b tw:border-border tw:pr-12", children: [
              /* @__PURE__ */ S.jsx(B2, { children: c }),
              /* @__PURE__ */ S.jsx(V2, { className: "tw:sr-only", children: "File metadata and gallery actions" })
            ] }),
            /* @__PURE__ */ S.jsx("div", { ref: g, className: "tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" })
          ]
        }
      )
    }
  );
}
const Sb = document.getElementById("gallery-react-toolbar");
Sb && U1.createRoot(Sb).render(
  /* @__PURE__ */ S.jsxs(EA, { children: [
    /* @__PURE__ */ S.jsx(OA, {}),
    /* @__PURE__ */ S.jsx(MA, {}),
    /* @__PURE__ */ S.jsx(AA, {})
  ] })
);
