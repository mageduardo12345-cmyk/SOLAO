# SOLAO Web — Guía de despliegue en Vercel

## Estructura del proyecto

```
solao-web/
├── public/
│   └── index.html        ← La página web completa
├── api/
│   └── read-cfe.js       ← Función serverless (lee recibos CFE)
├── vercel.json           ← Configuración de Vercel
└── README.md             ← Esta guía
```

---

## PASO 1 — Obtener el API Key de Anthropic

1. Entra a https://console.anthropic.com
2. Crea una cuenta con tu correo
3. Ve a **Billing** → agrega tarjeta de crédito
4. Ve a **API Keys** → clic en **Create Key**
5. Ponle nombre: `solao-web`
6. Copia la clave — empieza con `sk-ant-...`
7. Guárdala, solo se muestra una vez

---

## PASO 2 — Crear cuenta en Vercel

1. Entra a https://vercel.com
2. Clic en **Sign Up**
3. Elige **Continue with GitHub** (necesitas cuenta de GitHub)
   - Si no tienes GitHub: https://github.com → Sign Up (es gratis)
4. Autoriza a Vercel

---

## PASO 3 — Subir el proyecto a GitHub

1. Entra a https://github.com
2. Clic en el **+** arriba a la derecha → **New repository**
3. Nombre: `solao-web`
4. Selecciona **Private** (para que nadie vea tu código)
5. Clic en **Create repository**
6. En la siguiente pantalla, elige **uploading an existing file**
7. Arrastra TODOS los archivos de la carpeta `solao-web/`:
   - `public/index.html`
   - `api/read-cfe.js`
   - `vercel.json`
8. Clic en **Commit changes**

---

## PASO 4 — Desplegar en Vercel

1. Entra a https://vercel.com/dashboard
2. Clic en **Add New Project**
3. Elige tu repositorio `solao-web`
4. Clic en **Import**
5. En la pantalla de configuración:
   - Framework Preset: **Other**
   - Root Directory: dejar en blanco (/)
6. **ANTES de dar Deploy** → ve al siguiente paso

---

## PASO 5 — Agregar el API Key como variable de entorno ⚠️

Este es el paso más importante. El API key NUNCA debe ir en el código.

En la pantalla de Deploy de Vercel, busca la sección:
**Environment Variables**

Agrega esta variable:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-TUCLAVEAQUI...` |

Después de agregarla:
1. Clic en **Deploy**
2. Espera 1-2 minutos
3. Vercel te da una URL como: `solao-web.vercel.app`

---

## PASO 6 — Configurar dominio propio (opcional)

Si quieres usar `solaosoluciones.com` en lugar de `solao-web.vercel.app`:

1. En Vercel → tu proyecto → **Settings** → **Domains**
2. Escribe tu dominio y sigue las instrucciones
3. Vercel te da los DNS que debes configurar en donde compraste el dominio

---

## Si necesitas actualizar la página después

1. Edita los archivos localmente
2. Ve a GitHub → tu repositorio → el archivo que cambió
3. Clic en el ícono de lápiz (editar)
4. Pega el nuevo contenido
5. Clic en **Commit changes**
6. Vercel detecta el cambio y redespliega automáticamente en ~1 minuto

---

## Preguntas frecuentes

**¿Cuánto cuesta Vercel?**
El plan gratis (Hobby) es suficiente para SOLAO. Incluye:
- Despliegues ilimitados
- 100GB de ancho de banda al mes
- Funciones serverless incluidas

**¿El API key está seguro?**
Sí. Como variable de entorno en Vercel, nunca aparece en el código
que ven los visitantes del sitio. Solo el servidor puede acceder a él.

**¿Qué pasa si alguien intenta hackear el endpoint?**
La función solo acepta imágenes/PDF, valida el tipo y tamaño,
y no devuelve nada sensible. Lo peor que puede pasar es que
alguien use créditos de la API — puedes poner límite de gasto
en la consola de Anthropic.
