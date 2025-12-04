# Guía de Deploy

## Opción 1: Railway (Recomendado - Más Simple)

Railway es una plataforma que permite desplegar aplicaciones de forma muy sencilla.

### Requisitos
- Cuenta de GitHub
- Cuenta de Railway (https://railway.app) - puedes registrarte con GitHub

### Pasos

#### 1. Subir el proyecto a GitHub

```bash
# En el directorio del proyecto
git init
git add .
git commit -m "Initial commit"

# Crear repositorio en GitHub y luego:
git remote add origin https://github.com/TU_USUARIO/planificacion-dh.git
git push -u origin main
```

#### 2. Configurar Railway

1. Ve a https://railway.app y haz login con GitHub
2. Click en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Autoriza Railway para acceder a tus repositorios
5. Selecciona el repositorio `planificacion-dh`

#### 3. Agregar Base de Datos PostgreSQL

1. En tu proyecto de Railway, click en **"+ New"**
2. Selecciona **"Database"** → **"Add PostgreSQL"**
3. Railway creará automáticamente la base de datos

#### 4. Conectar la App con la Base de Datos

1. Click en tu servicio de la aplicación
2. Ve a la pestaña **"Variables"**
3. Click en **"Add Variable Reference"**
4. Selecciona `DATABASE_URL` de PostgreSQL
5. Agrega también:
   - `NODE_ENV` = `production`

#### 5. Deploy Automático

Railway desplegará automáticamente. Puedes ver el progreso en la pestaña **"Deployments"**.

#### 6. Obtener URL

Una vez desplegado, en la pestaña **"Settings"** de tu servicio:
1. Busca la sección **"Networking"**
2. Click en **"Generate Domain"**
3. Obtendrás una URL como: `https://planificacion-dh-production.up.railway.app`

### Comandos Útiles Railway CLI (Opcional)

```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Conectar proyecto local
railway link

# Ver logs
railway logs

# Abrir proyecto en browser
railway open
```

### Costos
- **Hobby Plan**: $5/mes incluye suficientes recursos para apps pequeñas
- **Free Tier**: 500 horas/mes gratis (suficiente para pruebas)

---

## Opción 2: Render (Alternativa Simple)

### Pasos

1. Ve a https://render.com y crea una cuenta
2. **New** → **Web Service**
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Name**: planificacion-dh
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. En **Environment Variables** agrega:
   - `NODE_ENV` = `production`
6. **New** → **PostgreSQL** para crear la base de datos
7. Copia el **Internal Database URL** y agrégalo como `DATABASE_URL`

---

## Opción 3: Google Cloud (Cloud Run + Cloud SQL)

### Requisitos previos
1. Cuenta de Google Cloud con billing activo
2. Google Cloud SDK instalado (`gcloud`)
3. Proyecto de GCP creado

### Paso 1: Configurar Google Cloud SDK

```bash
# Autenticarse
gcloud auth login

# Configurar proyecto (reemplaza PROJECT_ID con tu ID de proyecto)
gcloud config set project PROJECT_ID

# Habilitar APIs necesarias
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### Paso 2: Crear instancia de Cloud SQL (PostgreSQL)

```bash
# Crear instancia (puede tomar 5-10 minutos)
gcloud sql instances create planificacion-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=TU_PASSWORD_SEGURO

# Crear base de datos
gcloud sql databases create planificacion --instance=planificacion-db

# Crear usuario
gcloud sql users create appuser \
    --instance=planificacion-db \
    --password=TU_PASSWORD_USUARIO
```

### Paso 3: Obtener la conexión de Cloud SQL

```bash
# Obtener nombre de conexión
gcloud sql instances describe planificacion-db --format='value(connectionName)'
# Ejemplo de salida: proyecto-id:us-central1:planificacion-db
```

### Paso 4: Construir y subir imagen a Container Registry

```bash
# Desde el directorio del proyecto
cd /ruta/a/PlanificacionDH

# Construir imagen
gcloud builds submit --tag gcr.io/PROJECT_ID/planificacion-app
```

### Paso 5: Desplegar en Cloud Run

```bash
# Desplegar con conexión a Cloud SQL
gcloud run deploy planificacion-app \
    --image gcr.io/PROJECT_ID/planificacion-app \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --add-cloudsql-instances PROJECT_ID:us-central1:planificacion-db \
    --set-env-vars "DATABASE_URL=postgresql://appuser:TU_PASSWORD_USUARIO@/planificacion?host=/cloudsql/PROJECT_ID:us-central1:planificacion-db" \
    --set-env-vars "NODE_ENV=production"
```

### Paso 6: Acceder a la aplicación

Después del deploy, Cloud Run te dará una URL como:
```
https://planificacion-app-xxxxxxxx-uc.a.run.app
```

### Comandos útiles GCP

```bash
# Ver logs
gcloud run services logs read planificacion-app --region us-central1

# Actualizar la aplicación (después de cambios)
gcloud builds submit --tag gcr.io/PROJECT_ID/planificacion-app
gcloud run deploy planificacion-app --image gcr.io/PROJECT_ID/planificacion-app --region us-central1

# Eliminar recursos (si necesitas limpiar)
gcloud run services delete planificacion-app --region us-central1
gcloud sql instances delete planificacion-db
```

### Costos estimados GCP

- **Cloud SQL (db-f1-micro):** ~$7-10 USD/mes
- **Cloud Run:** Pago por uso, tier gratuito incluye 2 millones de requests/mes
- **Container Registry:** Mínimo, solo almacenamiento de imagen

---

## Migrar datos existentes (SQLite a PostgreSQL)

Si tienes datos en SQLite que quieres migrar:

### Opción A: Exportar a CSV

```bash
sqlite3 database.sqlite
.headers on
.mode csv
.output colaboradores.csv
SELECT * FROM colaboradores;
.output clientes.csv
SELECT * FROM clientes;
-- ... repetir para cada tabla
.quit
```

### Opción B: Usar herramienta de migración

Puedes usar pgloader o scripts personalizados para migrar los datos.

---

## Solución de problemas

### Error de conexión a base de datos
- Verifica que la instancia de PostgreSQL esté corriendo
- Verifica el DATABASE_URL en las variables de entorno
- Revisa los logs del servicio

### La aplicación no arranca
- Verifica que el Dockerfile esté correcto
- Revisa los logs de build

### Error 502 Bad Gateway
- La aplicación puede estar tardando en arrancar
- Verifica el health check endpoint: `/api/health`

### Variables de entorno requeridas
- `DATABASE_URL`: Conexión a PostgreSQL
- `NODE_ENV`: Debe ser `production` en producción
- `PORT`: Generalmente configurado automáticamente por la plataforma
