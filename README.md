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
DATABASE_URL=postgres://usuario:password@host:5432/postgres?sslmode=require
BUS_STOPS_CACHE_TTL_MS=43200000
LINE_VARIANTS_CACHE_TTL_MS=86400000
BUS_STOP_LINES_CACHE_TTL_MS=21600000
IMM_MIN_INTERVAL_MS=320
IMM_MAX_429_RETRIES=2
IMM_RETRY_BASE_MS=1200
```

Tambien se aceptan las variables antiguas `ID_CLIENTE` y `SECRETO_CLIENTE`.
`BUS_STOPS_CACHE_TTL_MS` controla en milisegundos el cache server-side de paradas (default: 12h).
Con `DATABASE_URL` habilitado, el cache se persiste en BD usando Prisma.

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
- `GET /api/busstops?q=<texto>&limit=<n>&refresh=1`
- `GET /api/busstops/:busstopId/lines`
- `GET /api/busstops/:busstopId/upcoming?lines=199,300&lineVariantIds=1453,1454&amountperline=2&format=json`
- `GET /api/gtfs/version`
- `GET /api/gtfs/static`
