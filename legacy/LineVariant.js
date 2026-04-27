// ------------------- Clase para las variantes de línea -------------------
class LineVariant {
  constructor(data) {
    this.lineVariantId = data.lineVariantId || null;
    this.line = data.line || '';
    this.lineId = data.lineId || '';
    this.origin = data.origin || '';
    this.destination = data.destination || '';
    this.subline = data.subline || '';
    this.special = data.special || false;
  }

  // Método para imprimir todos los campos de manera clara
  toString() {
    return `LineVariant {
  lineVariantId: ${this.lineVariantId},
  line: "${this.line}",
  lineId: "${this.lineId}",
  origin: "${this.origin}",
  destination: "${this.destination}",
  subline: "${this.subline}",
  special: ${this.special}
}`;
  }
}


// ------------------- Wrapper actualizado -------------------
/**
 * Obtiene el conjunto de las variantes de línea como objetos LineVariant.
 * @return {LineVariant[]} Array de objetos LineVariant.
 */
function getLineVariantsObjects() {
  const rawData = fetchData('/buses/linevariants');
  if (!rawData) return [];

  return rawData.map(item => new LineVariant(item));
}

// ------------------- Ejemplo de uso -------------------
function probarLineVariantsObjetos() {
  const variantes = getLineVariantsObjects();
  
  variantes.forEach(v => {
    Logger.log(`ID, ${v.lineVariantId}, : ${v.line}, Origen: ${v.origin}, Destino: ${v.destination}, Especial: ${v.special}`);
  });
}



// ------------------- Obtener detalle de una variante de línea -------------------
/**
 * Obtiene el detalle de una variante de línea como objeto LineVariant.
 * @param {number|string} lineVariantId El ID de la variante de línea.
 * @return {LineVariant|null} Objeto LineVariant o null si falla.
 */
function getLineVariantDetailsObject(lineVariantId) {
  if (!lineVariantId) return null;

  const rawData = fetchData(`/buses/linevariants/${lineVariantId}`);
  if (!rawData) return null;

  // Dependiendo de la API, puede devolver un array con un solo item o directamente el objeto
  const item = Array.isArray(rawData) ? rawData[0] : rawData;

  return new LineVariant(item);
}

// ------------------- Ejemplo de uso -------------------
function probarDetalleLinea() {
  const lineVariantId = 1453; // reemplazá con el ID que quieras
  const detalle = getLineVariantDetailsObject(lineVariantId);

  if (detalle) {
    Logger.log(detalle.toString());
  } else {
    Logger.log('No se pudo obtener la variante de línea');
  }
}
