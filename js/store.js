// Único dueño de la persistencia (localStorage). No hay backend: todo el
// estado vive acá. Store.init() carga (con defaults si no hay nada guardado)
// y cada Store.setX() mezcla el cambio, guarda, y devuelve el estado completo.
const Store = (function () {
  const KEY = "nombreapp_estado";

  function _defaults() {
    return {
      config: {},
      datos: {},
    };
  }

  function _leer() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : _defaults();
    } catch (e) {
      return _defaults();
    }
  }

  function _guardar(estado) {
    localStorage.setItem(KEY, JSON.stringify(estado));
    return estado;
  }

  let _estado = null;

  function init() {
    _estado = _leer();
    return _estado;
  }

  function setConfig(config) {
    _estado = _guardar({ ..._estado, config });
    return _estado;
  }

  function setDatos(datos) {
    _estado = _guardar({ ..._estado, datos });
    return _estado;
  }

  return { init, setConfig, setDatos };
})();
