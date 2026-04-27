# Parada IMM (Next.js + TypeScript)

Este repositorio ahora usa **Next.js (App Router) + TypeScript** y mantiene el esbozo original en archivos `.js` como referencia.
El esbozo original quedó agrupado en la carpeta `legacy/`.

## Requisitos

- Node.js 20+
- npm 10+

## Configuracion

1. Copia variables de entorno:

```bash
cp .env.example .env.local
```

2. Completa en `.env.local`:

```dotenv
MVD_API_CLIENT_ID=tu_cliente_id
MVD_API_CLIENT_SECRET=tu_secreto
```

Tambien se aceptan las variables antiguas `ID_CLIENTE` y `SECRETO_CLIENTE`.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Scripts

- `npm run dev`: servidor local
- `npm run build`: build de produccion
- `npm run start`: ejecutar build
- `npm run lint`: lint de Next.js
- `npm run typecheck`: chequeo de tipos

## Estructura principal

- `app/`: UI y rutas API de Next.js
- `app/paradas/page.tsx`: pantalla de mapa con favoritas y proximos
- `lib/imm-api.ts`: cliente server-side para OAuth + API IMM
- `lib/types.ts`: tipos compartidos
- `components/transport-dashboard.tsx`: interfaz de consultas
- `components/mapa/`: componentes de Leaflet cargados solo del lado cliente

## Endpoints creados

- `GET /api/linevariants`
- `GET /api/linevariants/:lineVariantId`
- `GET /api/buses?company=&lineVariantIds=&busId=&busstopId=&lines=&format=`
- `GET /api/busstops?q=<texto>&limit=<n>`
- `GET /api/busstops/:busstopId/lines`
- `GET /api/busstops/:busstopId/upcoming?lines=199,300&lineVariantIds=1453,1454&amountperline=2&format=json`
- `GET /api/gtfs/version`
- `GET /api/gtfs/static`
