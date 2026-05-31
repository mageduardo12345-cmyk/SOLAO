# SOLAO Web - Guia de despliegue en Vercel

## Estructura del proyecto

```text
solao-web/
|-- index.html           <- Redireccion simple al sitio publico
|-- admin.html           <- Panel privado de clientes y pagos
|-- public/
|   `-- index.html        <- La pagina web completa
|-- api/
|   `-- read-cfe.js       <- Funcion serverless (lee recibos CFE)
|-- vercel.json           <- Configuracion de Vercel
`-- README.md             <- Esta guia
```

---

## PASO 1 - Obtener el API Key de OpenAI

1. Entra a [platform.openai.com](https://platform.openai.com/)
2. Inicia sesion o crea tu cuenta
3. Ve a **Settings** > **Billing** y agrega saldo o metodo de pago
4. Ve a **API keys**
5. Da clic en **Create new secret key**
6. Ponle un nombre como `solao-web`
7. Copia la clave y guardala en un lugar seguro

La API key de OpenAI normalmente empieza con `sk-...` y solo se muestra completa una vez.

---

## PASO 2 - Crear cuenta en Vercel

1. Entra a [vercel.com](https://vercel.com/)
2. Clic en **Sign Up**
3. Elige **Continue with GitHub**
4. Autoriza a Vercel

---

## PASO 3 - Subir el proyecto a GitHub

Si ya estas usando GitHub Desktop y tu repo `SOLAO`, puedes saltarte este paso.

Si lo haces manualmente:

1. Entra a [github.com](https://github.com/)
2. Crea un repositorio
3. Sube el contenido de `solao-web/`
4. Verifica que existan:
   - `public/index.html`
   - `api/read-cfe.js`
   - `vercel.json`

---

## PASO 4 - Desplegar en Vercel

1. Entra a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Clic en **Add New Project**
3. Elige tu repositorio
4. Clic en **Import**
5. En configuracion:
   - **Framework Preset**: `Other`
   - **Root Directory**: dejar en blanco (`./`)

Antes de dar **Deploy**, ve al siguiente paso.

---

## PASO 5 - Agregar el API Key como variable de entorno

Este es el paso mas importante. La clave nunca debe ir en el codigo.

En Vercel, dentro del proyecto, agrega esta variable:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | `sk-...tu-clave...` |

Despues:

1. Clic en **Deploy**
2. Espera 1-2 minutos
3. Vercel te dara una URL publica

---

## PASO 6 - Si necesitas actualizar la pagina despues

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
En `/admin.html`. Por ahora guarda datos en el navegador con `localStorage`, asi puedes probar el flujo de clientes, pagos y disponibilidad sin montar base de datos todavia.
