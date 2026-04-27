// ------------------- Clase Bus -------------------
class Bus {
  constructor(data) {
    this.id = data.id || '';
    this.vehicleType = data.vehicleType || '';
    this.timestamp = data.timestamp ? Bus.parseTimestampLocal(data.timestamp) : null;
    this.location = data.location ? new GeoPoint(data.location) : null;
    this.companyName = data.companyName || '';
    this.line = data.line || '';
    this.lineVariantId = data.lineVariantId || '';
    this.origin = data.origin || '';
    this.destination = data.destination || '';
    this.subline = data.subline || '';
    this.special = data.special || false;
    this.vehicleIdentificationNumber = data.vehicleIdentificationNumber || '';
    this.access = data.access || '';
    this.thermalConfort = data.thermalConfort || '';
    this.emissions = data.emissions || '';
  }

  // Parsear timestamp de la API y mantener la hora local correcta
  static parseTimestampLocal(ts) {
    // extraemos la parte "YYYY-MM-DDTHH:MM:SS"
    const match = ts.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    if (!match) return new Date(ts); // fallback
    const s = match[1];
    // reemplazamos la T por espacio para tener formato legible
    return new Date(s.replace('T', ' '));
  }

  getFormattedTimestamp() {
    if (!this.timestamp) return '';
    const pad = n => String(n).padStart(2, '0');
    const y = this.timestamp.getFullYear();
    const m = pad(this.timestamp.getMonth() + 1);
    const d = pad(this.timestamp.getDate());
    const h = pad(this.timestamp.getHours());
    const min = pad(this.timestamp.getMinutes());
    const s = pad(this.timestamp.getSeconds());
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  toString() {
    return `Bus {
  id: "${this.id}",
  vehicleType: "${this.vehicleType}",
  timestamp: "${this.getFormattedTimestamp()}",
  location: ${this.location ? this.location.toString() : 'null'},
  companyName: "${this.companyName}",
  line: "${this.line}",
  lineVariantId: "${this.lineVariantId}",
  origin: "${this.origin}",
  destination: "${this.destination}",
  subline: "${this.subline}",
  special: ${this.special},
  vehicleIdentificationNumber: "${this.vehicleIdentificationNumber}",
  access: "${this.access}",
  thermalConfort: "${this.thermalConfort}",
  emissions: "${this.emissions}"
}`;
  }
}



// ------------------- Función para obtener buses -------------------
/**
 * Obtiene los buses del sistema como objetos Bus.
 * @param {object} params Parámetros opcionales de filtrado (lines, companyName, etc.).
 * @return {Bus[]} Array de objetos Bus.
 */
function getBusesObjects(params = {}) {
  const rawData = fetchData('/buses', params);
  if (!rawData) return [];
  return rawData.map(item => new Bus(item));
}

// ------------------- Ejemplo de uso -------------------
function probarBuses() {
  const params = {
    lines: '199',          // filtra por línea
  };

  const buses = getBusesObjects(params);

  if (buses.length === 0) {
    Logger.log("No hay buses que cumplan con los filtros.");
  } else {
    buses.forEach(bus => Logger.log(bus.toString()));
  }
}
