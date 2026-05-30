// api/read-cfe.js
// Función serverless de Vercel — lee recibos CFE con Claude Haiku
// El API key de Anthropic NUNCA se expone al navegador

export const config = {
  api: {
    bodyParser: false, // necesario para recibir archivos (multipart)
  },
};

// Lee el body multipart manualmente (sin dependencias externas)
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Extrae el archivo del body multipart/form-data
function extractFile(body, boundary) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = body.indexOf(boundaryBuffer, start);
    if (idx === -1) break;
    const end = body.indexOf(boundaryBuffer, idx + boundaryBuffer.length);
    if (end === -1) break;
    const part = body.slice(idx + boundaryBuffer.length + 2, end - 2);
    parts.push(part);
    start = end;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.slice(0, headerEnd).toString();
    if (!headerStr.includes('filename=')) continue;

    const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
    const fileData = part.slice(headerEnd + 4);

    return { data: fileData, contentType };
  }

  return null;
}

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  // Verificar que el API key está configurado
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY no configurado en variables de entorno');
    return res.status(500).json({
      success: false,
      error: 'Servicio no configurado. Contacta al administrador.',
    });
  }

  try {
    // Leer el archivo del request
    const rawBody = await parseMultipart(req);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);

    if (!boundaryMatch) {
      return res.status(400).json({ success: false, error: 'Request inválido: falta boundary' });
    }

    const boundary = boundaryMatch[1].trim();
    const file = extractFile(rawBody, boundary);

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Formato no válido. Sube JPG, PNG o PDF.',
      });
    }

    // Validar tamaño (5MB máx)
    if (file.data.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'El archivo es demasiado pesado. Máximo 5MB.',
      });
    }

    // Convertir a base64
    const base64 = file.data.toString('base64');
    const isPdf = file.contentType === 'application/pdf';

    // Prompt del sistema — solo extrae datos, no calcula nada
    const systemPrompt = `Eres un extractor de datos de recibos CFE de México.
Analiza la imagen del recibo y devuelve ÚNICAMENTE JSON válido, sin texto extra, sin backticks, sin explicaciones.

Extrae exactamente estos campos:
- customerName: nombre del titular si aparece, si no null
- kwhBimonthly: consumo total del periodo en kWh como número entero, si no null
- totalPaid: total a pagar en pesos mexicanos como número sin signo $, si no null
- billingPeriod: periodo facturado (ej. "MAR-ABR 2026"), si no null
- tariff: tarifa CFE si aparece (ej. "1C", "DAC"), si no null
- confidence: número entre 0.0 y 1.0 según tu certeza de la lectura

Reglas estrictas:
- NO inventes ningún dato
- Si no puedes leer claramente un campo, pon null
- NO calcules ahorro solar ni recomiendes paneles
- Devuelve ÚNICAMENTE el objeto JSON, nada más`;

    const userMessage = isPdf
      ? 'Este es un PDF de un recibo CFE mexicano. Extrae los datos.'
      : 'Esta es una imagen de un recibo CFE mexicano. Extrae los datos.';

    // Llamar a Claude Haiku
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: isPdf ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: file.contentType,
                  data: base64,
                },
              },
              { type: 'text', text: userMessage },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errBody);
      return res.status(502).json({
        success: false,
        error: 'Error al conectar con el servicio de lectura. Intenta de nuevo.',
      });
    }

    const apiData = await anthropicResponse.json();
    const rawText = apiData.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Parsear el JSON de la respuesta
    let parsed;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error('JSON parse error. Raw response:', rawText);
      return res.status(200).json({
        success: false,
        error: 'No pudimos interpretar el recibo. Intenta con una foto más clara o ingresa los datos manualmente.',
      });
    }

    // Validar que tengamos al menos un dato útil
    const hasKwh = parsed.kwhBimonthly && Number(parsed.kwhBimonthly) > 0;
    const hasPaid = parsed.totalPaid && Number(parsed.totalPaid) > 0;

    if (!hasKwh && !hasPaid) {
      return res.status(200).json({
        success: false,
        error: 'No pudimos detectar los datos del recibo. Intenta con una foto más clara o ingresa los datos manualmente.',
      });
    }

    // Éxito — devolver datos limpios
    return res.status(200).json({
      success: true,
      data: {
        customerName: parsed.customerName || null,
        kwhBimonthly: parsed.kwhBimonthly ? Number(parsed.kwhBimonthly) : null,
        totalPaid: parsed.totalPaid ? Number(parsed.totalPaid) : null,
        billingPeriod: parsed.billingPeriod || null,
        tariff: parsed.tariff || null,
        confidence: parsed.confidence || null,
      },
      warnings: [
        !hasKwh ? 'No se detectó el consumo en kWh' : null,
        !hasPaid ? 'No se detectó el total pagado' : null,
      ].filter(Boolean),
    });
  } catch (err) {
    console.error('Error inesperado en read-cfe:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno. Por favor intenta de nuevo o ingresa los datos manualmente.',
    });
  }
}
