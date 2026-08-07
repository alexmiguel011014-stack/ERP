(function () {
  var cache = null;
  var listeners = [];

  function notificar() {
    listeners.forEach(function (fn) { try { fn(cache); } catch (e) {} });
  }

  var store = {
    getCategoriasFlux: function () {
      if (cache) return Promise.resolve(cache);
      return store.refresh();
    },

    refresh: function () {
      if (!window.erpBanco || !window.erpBanco.categorias || !window.erpBanco.categorias.comUso) {
        cache = [];
        notificar();
        return Promise.resolve([]);
      }
      return window.erpBanco.categorias.comUso().then(function (lista) {
        cache = Array.isArray(lista) ? lista : [];
        notificar();
        return cache;
      }).catch(function () {
        cache = [];
        notificar();
        return [];
      });
    },

    onChange: function (fn) {
      listeners.push(fn);
      return function () {
        var idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },

    getCache: function () {
      return cache || [];
    }
  };

  // Escuta evento IPC global de mudança de categorias
  window.addEventListener("categorias-changed", function () {
    store.refresh();
  });

  window.erpCategoryStore = store;
})();