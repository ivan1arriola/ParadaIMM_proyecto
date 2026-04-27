// ------------------- Clase para la posición geográfica -------------------
class GeoPoint {
  constructor(data) {
    this.type = data?.type || '';
    this.coordinates = data?.coordinates || []; // [longitud, latitud]
  }

  toString() {
    return `GeoPoint { type: "${this.type}", coordinates: [${this.coordinates.join(', ')}] }`;
  }
}

// ------------------- Clase para una parada de bus -------------------
class BusStop {
  constructor(data) {
    this.busstopId = data.busstopId || null;
    this.street1 = data.street1 || '';
    this.street2 = data.street2 || '';
    this.street1Id = data.street1Id || null;
    this.street2Id = data.street2Id || null;
    this.location = new GeoPoint(data.location);
  }

  toString() {
    return `BusStop {
  busstopId: ${this.busstopId},
  street1: "${this.street1}",
  street2: "${this.street2}",
  street1Id: ${this.street1Id},
  street2Id: ${this.street2Id},
  location: ${this.location.toString()}
}`;
  }
}

// ------------------- Función para obtener todas las paradas como objetos -------------------
function getBusStopsObjects() {
  const rawData = fetchData('/buses/busstops');
  if (!rawData) return [];

  return rawData.map(item => new BusStop(item));
}

// ------------------- Ejemplo de uso -------------------
function probarBusStops() {
  const paradas = getBusStopsObjects();

  paradas.forEach(stop => {
    Logger.log(stop.toString());
  });
}
