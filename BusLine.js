// ------------------- Clase para una línea de parada -------------------
class BusLine {
  constructor(data) {
    this.line = data.line || '';
    this.lineId = data.lineId || '';
  }

  toString() {
    return `BusLine { line: "${this.line}", lineId: "${this.lineId}" }`;
  }
}

// ------------------- Función para obtener líneas por parada -------------------
/**
 * Obtiene las líneas que pasan por una parada específica como objetos BusLine.
 * @param {number|string} busstopId ID de la parada.
 * @return {BusLine[]} Array de objetos BusLine.
 */
function getLinesByBusStopObjects(busstopId) {
  if (!busstopId) return [];

  const rawData = fetchData(`/buses/busstops/${busstopId}/lines`);
  if (!rawData) return [];

  return rawData.map(item => new BusLine(item));
}

// ------------------- Ejemplo de uso -------------------
function probarLineasPorParada() {
  const busstopId = 3714; // ID de la parada que te interesa
  const lines = getLinesByBusStopObjects(busstopId);

  lines.forEach(line => {
    Logger.log(line.toString());
  });
}




