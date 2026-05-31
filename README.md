# SOLAO Web - Guia de despliegue en Vercel

## Estructura del proyecto

```text
solao-web/
|-- index.html           <- Redireccion simple al sitio publico
|-- admin.html           <- Copia del panel privado para acceso directo
|-- public/
|   |-- index.html        <- La pagina web completa
|   `-- admin.html        <- Panel privado de clientes y pagos
|-- api/
|   |-- read-cfe.js       <- Funcion serverless (lee recibos CFE)
|   |-- admin-login.js    <- Login del panel privado
|   |-- admin-logout.js   <- Cierre de sesion
|   |-- admin-me.js       <- Verifica la sesion activa
|   `-- admin-state.js    <- Lee y guarda el panel en la nube
|-- vercel.json           <- Configuracion de Vercel
`-- README.md             <- Esta guia
```

---

## PASO 1 - Obtener el API Key de OpenAI

1. Entra a [platform.openai.com](https://platform.openai.com/)
2. Inicia sesion o crea tu cuenta
3. Ve a **Billing** y agrega saldo o metodo de pago
4. Ve a **API keys**
5. Da clic en **Create new secret key**
6. Ponle un nombre como `solao-web`
7. Copia la clave y guardala en un lugar seguro

La API key de OpenAI normalmente empieza con `sk-...` y solo se muestra completa una vez.

---

## PASO 2 - Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com/)
2. Crea un proyecto nuevo
3. Espera a que termine de prepararse
4. Abre el editor SQL y ejecuta esto:

```sql
create table if not exists public.solao_admin_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.solao_admin_state enable row level security;
```

Esta tabla guardara:
- clientes
- pagos
- disponibilidad
- filtros
- cliente seleccionado

---

## PASO 3 - Crear cuenta en Vercel

1. Entra a [vercel.com](https://vercel.com/)
2. Clic en **Sign Up**
3. Elige **Continue with GitHub**
4. Autoriza a Vercel

---

## PASO 4 - Subir el proyecto a GitHub

Si ya estas usando GitHub Desktop y tu repo `SOLAO`, puedes saltarte este paso.

Si lo haces manualmente:

1. Entra a [github.com](https://github.com/)
2. Crea un repositorio
3. Sube el contenido de `solao-web/`
4. Verifica que existan:
   - `public/index.html`
   - `public/admin.html`
   - `api/read-cfe.js`
   - `api/admin-state.js`
   - `vercel.json`

---

## PASO 5 - Desplegar en Vercel

1. Entra a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Clic en **Add New Project**
3. Elige tu repositorio
4. Clic en **Import**
5. En configuracion:
   - **Framework Preset**: `Other`
   - **Root Directory**: dejar en blanco (`./`)

Antes de dar **Deploy**, ve al siguiente paso.

---

## PASO 6 - Agregar variables de entorno

Este es el paso mas importante. Las claves nunca deben ir en el codigo.

En Vercel, dentro del proyecto, agrega estas variables:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | `sk-...tu-clave...` |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...tu_service_role...` |
| `ADMIN_USER` | `Antonio` |
| `ADMIN_PASSWORD` | `SOLAO-2026` |
| `ADMIN_SESSION_SECRET` | una frase larga y dificil de adivinar |

Despues:

1. Clic en **Deploy**
2. Espera 1-2 minutos
3. Vercel te dara una URL publica

---

## PASO 7 - Como funciona el panel privado

- Entra a `/admin.html`
- Inicia sesion con `Antonio`
- Los datos se guardan en Supabase
- Si abres el panel en otro celular o en otra computadora, veras lo mismo
- `Exportar respaldo` baja una copia JSON por si quieres guardar una copia extra
- `Importar respaldo` restaura esa copia si algun dia la necesitas

---

## PASO 8 - Si necesitas actualizar la pagina despues

1. Edita los archivos localmente
2. Haz commit y push a GitHub
3. Vercel detecta el cambio y redespliega automaticamente

---

## Preguntas frecuentes

**El API key esta seguro?**  
Si. Como variable de entorno en Vercel, no aparece en el navegador de tus visitantes.

**Que modelo usa la lectura de recibos?**  
Actualmente la funcion usa `gpt-4o-mini` para mantener bajo el costo.

**Que pasa si alguien intenta abusar del endpoint?**  
La funcion solo acepta JPG, PNG o PDF y limita el tamano del archivo a 5MB. Aun asi, conviene poner limite de gasto en OpenAI.

**Donde esta el panel privado?**  
En `/admin.html`. Ahora el panel guarda los datos en internet para que se vean igual en celular y computadora.
