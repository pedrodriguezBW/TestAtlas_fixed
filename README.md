# Test Atlas (standalone)

Test Atlas organiza los archivos de ensayos climáticos, las evidencias fotográficas y
los datos de medida en la estructura de carpetas estándar del repositorio de proyecto.

Este proyecto es la versión **independiente** de Test Atlas, extraída de Engineering
Toolbox. Conserva el mismo backend (Java 25 + Spring Boot 4.1.1, algoritmo `TEST_ATLAS`
versión **1.0**) y la misma interfaz (React 19 + TypeScript + Mantine, interfaz **1.1**),
sin el catálogo de herramientas, la base de datos PostgreSQL ni las integraciones
(Jira, Polarion, TeamCenter) de la Toolbox.

```
test-atlas-standalone/
├── backend/        API Spring Boot (Maven): plan, subidas, lecturas del repositorio y guardado
├── frontend/       Asistente React (Vite) + servidor Node opcional para producción
├── .env.example    Variables de configuración (valores de ejemplo)
└── README.md
```

## 1. Requisitos

| Herramienta | Versión | Uso |
|---|---|---|
| JDK | **25** | Backend (`java.version=25` en `pom.xml`) |
| Maven | 3.9.x (incluido el wrapper `mvnw`, que descarga Maven 3.9.16) | Backend |
| Node.js | 24.x (probado con 24.7.0) | Frontend |
| npm | 11.x | Frontend |

Acceso a Maven Central y al registro npm (o a los mirrors corporativos configurados en
`~/.m2/settings.xml` y `.npmrc`). **No** se necesita PostgreSQL ni las librerías
`polarion-ws-client` / `polarion-axis-patch` que exigía la Toolbox.

## 2. Configurar el entorno

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

Edita `.env`. Lo mínimo para trabajar en local es apuntar el repositorio de proyecto a
una carpeta local vacía. En producción, los ensayos climáticos se guardan en
`//vigvsfil1.global.borgwarner.net/vigproductengineering/Documentacion_I+D/R&T/9. CL` y los de
vibraciones en `//vigvsfil1.global.borgwarner.net/vigproductengineering/Documentacion_I+D/R&T/7. Vib`:

```
TESTATLAS_REPOSITORY_ROOT=/tmp/test-atlas-repository               # Windows: C:/Temp/TestAtlasRepository
TESTATLAS_VIBRATION_REPOSITORY_ROOT=/tmp/test-atlas-vibration      # Windows: C:/Temp/TestAtlasVibration
```

- **Backend**: Spring Boot lee automáticamente `.env` (o `../.env`) cuando se arranca desde
  `backend/`. Las variables de entorno reales tienen prioridad.
- **Frontend**: Vite y el servidor Node leen variables del entorno del proceso. Carga `.env`
  en la terminal antes de los comandos npm, o deja los valores por defecto (backend en
  `http://127.0.0.1:17000`, frontend en el puerto `18000`):

  ```bash
  set -a; . ./.env; set +a                     # bash / zsh, desde la raíz del proyecto
  ```
  ```powershell
  Get-Content .env | Where-Object { $_ -match '^[A-Za-z_]+=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }   # PowerShell
  ```

| Variable | Por defecto | Descripción |
|---|---|---|
| `SERVER_PORT` / `SERVER_ADDRESS` | `17000` / `127.0.0.1` | Puerto y dirección del backend |
| `TESTATLAS_REPOSITORY_ROOT` | `…\R&T\9. CL` | Raíz del repositorio de ensayos climáticos (debe ser escribible por la cuenta que ejecuta el backend) |
| `TESTATLAS_VIBRATION_REPOSITORY_ROOT` | `…\R&T\7. Vib` | Raíz del repositorio de ensayos de vibraciones (debe ser escribible por la cuenta que ejecuta el backend) |
| `TESTATLAS_STAGING_ROOT` | `<tmp>/test-atlas-staging` | Carpeta temporal de subidas |
| `TESTATLAS_FRONTEND_ORIGINS` | `http://localhost:18000,http://127.0.0.1:18000` | Orígenes CORS permitidos (solo si el frontend llama al backend directamente) |
| `BACKEND_URL` | `http://127.0.0.1:17000` | Destino del proxy `/api` (Vite en desarrollo y `npm start`) |
| `VITE_BACKEND_URL` | vacío | URL del backend incrustada en el build estático. Vacío = peticiones relativas `/api` |
| `FRONTEND_HOST`, `FRONTEND_PORT`, `SITE_DIR`, `API_PROXY_TIMEOUT_MS` | — | Solo para el servidor Node opcional (`npm start`) |

## 3. Instalar dependencias

```bash
cd backend
./mvnw -DskipTests package        # Windows: mvnw.cmd -DskipTests package
cd ../frontend
npm ci
```

## 4. Ejecutar Test Atlas en local

Terminal 1 – backend (API en `http://127.0.0.1:17000`):

```bash
cd backend
./mvnw spring-boot:run            # o: java -jar target/test-atlas-backend-1.0.0-SNAPSHOT.jar
```

Terminal 2 – frontend (servidor de desarrollo con proxy `/api` → backend):

```bash
cd frontend
npm run dev
```

Abre **http://localhost:18000/**. Test Atlas se abre directamente (no hay catálogo).
Comprobación rápida de la API: `GET http://127.0.0.1:17000/api/scripts/versions` →
`{"TEST_ATLAS":"1.0"}`.

### Despliegue (opcional)

- **Estático**: `VITE_BACKEND_URL=http://<backend>:17000 npm run build` y publica `frontend/dist`.
  Añade el origen del frontend a `TESTATLAS_FRONTEND_ORIGINS`.
- **Mismo origen con Node**: `npm run build` con `VITE_BACKEND_URL` vacío y después
  `npm start` con `FRONTEND_HOST`, `FRONTEND_PORT`, `BACKEND_URL`, `SITE_DIR`,
  `API_PROXY_TIMEOUT_MS` definidas.
- El backend debe poder escribir en `TESTATLAS_REPOSITORY_ROOT`.

## 5. Ejecutar los tests

```bash
cd backend
./mvnw test                       # JUnit: algoritmo, planner, staging, controladores y contexto

cd ../frontend
npm run typecheck                 # tsc -b
npm run lint                      # oxlint (solo lectura)
npm test                          # Vitest: asistente, modelo, estilos, vista standalone
npm run test:server               # node --test: servidor proxy opcional
npm run build                     # tsc -b && vite build
```

Ningún test usa el repositorio de proyecto real ni servicios externos: el backend usa
carpetas temporales y el frontend simula las respuestas HTTP.

## API

El contrato está en `backend/openapi.yaml`:

- `GET /api/scripts`, `GET /api/scripts/versions`, `POST /api/scripts/TEST_ATLAS`
  (guardado; respuesta NDJSON con mensajes `progress` / `result` / `error`).
- `/api/test-atlas/**`: revisión del plan (no escribe), subidas temporales binarias,
  sugerencias, estado del test, fotos guardadas y libros existentes.

## Notas

- El registro de ejecuciones que la Toolbox guardaba en PostgreSQL se sustituye por una
  línea en el log del backend (`AlgorithmService`) con el resultado y el resumen.
- Vibraciones usa la misma convención que Climáticos:
  `<Nº> - <Programa>\<Fase>\BATCH - <Tanda>\TEST - <Código> - <Tipo> - <Eje>\MM - <Código>`, y bajo
  cada MM `01_Inputs`, `02_Evidences` (`00_Initial`, `NN_…`, `99_Final`; las fotos conservan su nombre),
  `03_Data` (`01_Results`, `02_Characterization`, `03_CANoe`) y `04_Report` (`test_metadata.json`).
  Los workbooks se renombran `<AAMMDD>_VB_Inputs_<Programa>_<Fase>_<Tanda>[_<Test>_<Eje>]`.
  Las carpetas antiguas (`0000_Ejemplo\01_DV\…`) no se migran ni se sugieren.
