let dom = (function nodeSelector () {
  // Convert a function into a property selector
  // It converts "(a, b) => [a, b]" but keeps "a => a"
  let DOM = (...sel) => DOM.api.array(DOM.api.selectors(sel.length <= 1 ? sel[0] : sel));

  // The second-level SELECTOR
  // dom.class(X); dom.class.X; dom.class.X = 5; delete.dom.class.X
  // This is NOT matched though: dom.a.X
  const derivated = (selector, orig) => {
    // Allow for a function to be used as getter
    return new Proxy(sel => DOM(selector(sel)), {
      get: (orig, name) => {
        return selector(name);
      }, set: (orig, name, value) => {
        DOM[selector(name)] = value;
        return true;
      }, deleteProperty: (orig, name) => {
        delete DOM[selector(name)];
        return true;
      }
    });
  };

  // First level SELECTOR
  // dom.button || dom.class
  let getter = (orig, key) => {
    if (key in orig) return orig[key];

    // Allow extending the API
    if (key in orig.api.selectors) {
      return derivated(orig.api.selectors[key], orig);
    }

    return orig.api.array(orig.api.selectors(key));
  };

  let setter = (orig, key, value) => {
    let cb = DOM.api.fn(value, true);
    DOM[key].each(node => node.parentNode.replaceChild(cb(node)[0], node));
  };

  let deletter = (base, key) => {
    DOM[key].forEach(n => n.remove());
    return true;
  };

  DOM.api = {};

  // CANNOT SIMPLIFY TO "return new Proxy()" => ERROR WTF?
  DOM = new Proxy(DOM, {
    get: getter,
    set: setter,
    deleteProperty: deletter
  });

  return DOM;
})();

// Second level selector
// let a = dom.a.href; dom.a.href = '...'; delete dom.a.href;
dom = (function Attributes (DOM) {
  // Obtain a callback from the attribute passed, whatever the type
  DOM.api.fn = (value, parse = false) => {
    let cb = node => parse ? DOM(value) : value;
    if (value instanceof Function) cb = value;
    return cb;
  };

  // Returns something that is not a list of nodes, so keep them in reference
  DOM.api.proxify = (proxify, nodes, key) => {
    proxify._ = { ref: nodes, attr: key };
    return DOM.api.values(proxify);
  };

  DOM.api.array = nodes => {
    let getter = (orig, key) => {
      // Array original function: dom.a.map()
      if (key in orig) {
        return orig[key];
      }

      // Nodes API function: dom.a.class, dom.a.on
      if (key in DOM.api.nodes) {
        let nodeCb = DOM.api.nodes[key];
        if (nodeCb.get) nodeCb = nodeCb.get;
        let newNodes = nodes.map((nodes, i, all) => nodeCb(nodes, i, all));
        return DOM.api.proxify(newNodes, nodes, key);
      }

      // Navigation API function: dom.a.parent
      if (key in DOM.api.navigate) {
        let cb = DOM.api.navigate[key];
        // Make it into a simple array if an array of arrays was returned
        let newNodes = nodes.map(cb).reduce((all, one) => {
          return all.concat(one);
        }, []).filter(n => n);
        return DOM.api.array(newNodes);
      }

      // Defaults to the attribute: dom.a.href
      let newNodes = nodes.map(node => node.getAttribute(key) || '');
      return DOM.api.proxify(newNodes, nodes, key);
    };

    // Setting the array; convert to fn and then proceed
    let setter = (orig, key, value) => {
      let cb = DOM.api.fn(value);
      let nodeCb = DOM.api.nodes[key];
      if (nodeCb) {
        if (nodeCb.set) nodeCb = nodeCb.set;
        orig.map((node, i, all) => nodeCb(cb, node, i, all));
        return true;
      }

      if (value instanceof Function) {
        cb = (node, i, orig) => value(node.getAttribute(key) || '', i, orig);
      } else {
        cb = node => value;
      }
      orig.forEach((node, i, orig) => node.setAttribute(key, cb(node, i, orig) || ''));
    };

    let deletter = (orig, key) => {
      let cb = el => el.removeAttribute(key);
      if (DOM.api.nodes[key] && DOM.api.nodes[key].del) {
        cb = DOM.api.nodes[key].del;
      }
      orig.forEach(cb);
      return true;
    };

    return new Proxy(nodes, {
      get: getter,
      set: setter,
      deleteProperty: deletter
    });
  };

  return DOM;
})(dom);

// Derivated attribute (when it was Nodes and not Navigate)
// let a = dom.a.class.demo; dom.a.class.demo = true; delete dom.a.class.demo
dom = (function Values (DOM) {
  let specialAttrs = {
    _flat: lists => [...new Set([].concat.apply([], lists))],
    _text: lists => [...new Set([].concat.apply([], lists))].join(' ')
  };

  DOM.api.values = attributes => {
    // dom.a.href._blank; dom.a.class.bla
    let getter = (orig, key) => {
      if (key in orig || typeof orig[key] !== 'undefined') {
        return orig[key];
      }
      let nodes = orig._.ref;
      let cb = DOM.api.attributes[orig._.attr];
      if (cb && cb.get) {
        cb = cb.get;
        orig.map((attr, i, all) => cb(attr, key, nodes[i], i, all));
      }
      if (key in specialAttrs) {
        return specialAttrs[key](orig);
      }
      // TODO: personalized attr (such as in parent)
      return specialAttrs._flat(orig).includes(key);
    };

    // dom.a.class.bla = false; dom.a.href._blank = false;
    let setter = (orig, key, value) => {
      let nodes = orig._.ref;
      let attrCb = DOM.api.attributes[orig._.attr];
      if (attrCb) {
        if (attrCb.set) attrCb = attrCb.set;
        orig.map((attr, i, all) => attrCb(DOM.api.fn(value), key, nodes[i], i, all));
      }
      return true;
    };

    let deletter = (orig, key) => {
      let nodes = orig._.ref;
      let attrCb = DOM.api.attributes[orig._.attr].del;
      if (attrCb) {
        orig.map((attr, i, all) => attrCb(key, nodes[i], i, all));
      }
      return true;
    };

    return new Proxy(attributes, {
      get: getter,
      set: setter,
      deleteProperty: deletter
    });
  };

  return DOM;
})(dom);

if (typeof module !== 'undefined') {
  module.exports = dom;
}
