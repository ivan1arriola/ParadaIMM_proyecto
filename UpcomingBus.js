

// ------------------- Clase para un bus próximo -------------------
class UpcomingBus {
  constructor(data, busStop = null) {
    this.lineVariantId = data.lineVariantId || null;
    this.line = data.line || '';
    this.lineId = data.lineId || '';
    this.origin = data.origin || '';
    this.destination = data.destination || '';
    this.subline = data.subline || '';
    this.special = data.special || false;

    // Información de la parada asociada
    this.busStop = busStop;
  }

  toString() {
    return `UpcomingBus {
  lineVariantId: ${this.lineVariantId},
  line: "${this.line}",
  lineId: "${this.lineId}",
  origin: "${this.origin}",
  destination: "${this.destination}",
  subline: "${this.subline}",
  special: ${this.special},
  busStop: ${this.busStop ? this.busStop.toString() : 'null'}
}`;
  }
}

// ------------------- Función para obtener buses próximos -------------------
/**
 * Obtiene los buses próximos a llegar a una parada como objetos UpcomingBus.
 * @param {number|string} busstopId ID de la parada.
 * @param {Array|string} lines Array de líneas o línea individual a consultar.
 * @return {UpcomingBus[]} Array de objetos UpcomingBus.
 */
function getUpcomingBusesObjects(busstopId, lines) {
  if (!busstopId || !lines) return [];

  // Convertir a array si viene como string
  const linesArray = Array.isArray(lines) ? lines : [lines];

  // Consultamos la parada para incluir su info completa en los buses
  const busStopData = fetchData(`/buses/busstops/${busstopId}`);
  const busStop = busStopData ? new BusStop(busStopData) : new BusStop({ busstopId });

  // La API espera lines como coma-separadas
  const params = {
    lines: linesArray.join(',')
  };

  const rawData = fetchData(`/buses/busstops/${busstopId}/upcomingbuses`, params);
  if (!rawData) return [];

  return rawData.map(item => new UpcomingBus(item, busStop));
}

// ------------------- Ejemplo de uso -------------------
function probarUpcomingBuses() {
  const busstopId = 3714; // ID de la parada que te interesa
  const lines = ['199']; // líneas a consultar

  const buses = getUpcomingBusesObjects(busstopId, lines);

  if (buses.length === 0) {
    Logger.log("No hay buses próximos para la línea indicada en esta parada.");
  } else {
    buses.forEach(bus => {
      Logger.log(bus.toString());
    });
  }
}
