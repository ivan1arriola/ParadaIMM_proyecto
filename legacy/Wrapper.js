/**
 * Realiza una llamada GET a la API de Transporte Público con el token de autenticación.
 *
 * @param {string} endpoint El endpoint de la API, por ejemplo '/buses'.
 * @param {object} params Un objeto con los parámetros de la consulta (query parameters).
 * @return {object} La respuesta de la API en formato JSON, o null si la llamada falla.
 */
function fetchData(endpoint, params = {}) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }

  const baseUrl = 'https://api.montevideo.gub.uy/api/transportepublico';
  const url = baseUrl + endpoint;

  // Construir la URL con los parámetros de la consulta
  const queryString = Object.keys(params).map(key => {
    if (Array.isArray(params[key])) {
      return params[key].map(value => `${key}=${encodeURIComponent(value)}`).join('&');
    }
    return `${key}=${encodeURIComponent(params[key])}`;
  }).join('&');

  const finalUrl = queryString ? `${url}?${queryString}` : url;

  const options = {
    'method': 'get',
    'headers': {
      'Authorization': 'Bearer ' + accessToken
    },
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(finalUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode === 200) {
      return JSON.parse(responseBody);
    } else {
      Logger.log('Llamada a la API falló. Código: ' + responseCode);
      Logger.log('Cuerpo de la respuesta: ' + responseBody);
      return null;
    }
  } catch (e) {
    Logger.log('Excepción al llamar a la API: ' + e.toString());
    return null;
  }
}

// ------------------- Funciones del Wrapper de la API -------------------

/**
 * Obtiene el conjunto de las variantes de línea.
 * @return {Array} Colección de variantes de línea.
 */
function getLineVariants() {
  return fetchData('/buses/linevariants');
}

/**
 * Obtiene el detalle de una variante de línea.
 * @param {string} lineVariantId El identificador de la variante de línea.
 * @return {object} Detalle de la variante de línea.
 */
function getLineVariantDetails(lineVariantId) {
  return fetchData(`/buses/linevariants/${lineVariantId}`);
}

/**
 * Obtiene la lista de paradas.
 * @return {Array} Colección de paradas.
 */
function getBusStops() {
  return fetchData('/buses/busstops');
}

/**
 * Obtiene las líneas por parada.
 * @param {number} busstopId El identificador de la parada.
 * @return {Array} Colección de líneas por parada.
 */
function getLinesByBusStop(busstopId) {
  return fetchData(`/buses/busstops/${busstopId}/lines`);
}

/**
 * Obtiene los buses próximos a llegar a una parada.
 * @param {number} busstopId El identificador de la parada.
 * @param {object} params Parámetros de la consulta (lineVariantIds, lines, etc.).
 * @return {Array} Colección de próximos buses.
 */
function getUpcomingBuses(busstopId, params) {
  return fetchData(`/buses/busstops/${busstopId}/upcomingbuses`, params);
}

/**
 * Obtiene los buses del sistema que cumplen con los filtros.
 * @param {object} params Parámetros de la consulta (company, lines, etc.).
 * @return {Array} Colección de buses.
 */
function getBuses(params) {
  return fetchData('/buses/buses', params);
}