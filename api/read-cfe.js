// api/read-cfe.js
// Funcion serverless de Vercel: lee recibos CFE con OpenAI
// El API key de OpenAI nunca se expone al navegador

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function parseDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    : null;

  if (!match) {
    return null;
  }

  return {
    contentType: match[1],
    base64: match[2],
  };
}

function extractOpenAIText(responseBody) {
  if (typeof responseBody.output_text === 'string' && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  if (!Array.isArray(responseBody.output)) {
    return '';
  }

  return responseBody.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
    .trim();
}

function buildUserContent(file, base64, isPdf) {
  const prompt = isPdf
    ? 'Este es un PDF de un recibo CFE mexicano. Extrae los datos.'
    : 'Esta es una imagen de un recibo CFE mexicano. Extrae los datos.';

  if (isPdf) {
    return [
      {
        type: 'input_file',
        filename: 'recibo-cfe.pdf',
        file_data: `data:${file.contentType};base64,${base64}`,
      },
      { type: 'input_text', text: prompt },
    ];
  }

  return [
    {
      type: 'input_image',
      image_url: `data:${file.contentType};base64,${base64}`,
    },
    { type: 'input_text', text: prompt },
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo no permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY no configurado en variables de entorno');
    return res.status(500).json({
      success: false,
      error: 'Servicio no configurado. Contacta al administrador.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const parsedFile = parseDataUrl(body?.fileData);

    if (!parsedFile) {
      return res.status(400).json({
        success: false,
        error: 'No se recibio ningun archivo valido',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(parsedFile.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Formato no valido. Sube JPG, PNG o PDF.',
      });
    }

    const fileBuffer = Buffer.from(parsedFile.base64, 'base64');

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: 'El archivo es demasiado pesado. Maximo 5MB.',
      });
    }

    const base64 = fileBuffer.toString('base64');
    const isPdf = parsedFile.contentType === 'application/pdf';

    const instructions = `Eres un extractor de datos de recibos CFE de Mexico.
Analiza el recibo y devuelve unicamente JSON valido, sin texto extra, sin backticks y sin explicaciones.

Extrae exactamente estos campos:
- customerName: nombre del titular si aparece, si no null
- kwhBimonthly: consumo total del periodo en kWh como numero entero, si no null
- totalPaid: total a pagar en pesos mexicanos como numero sin signo $, si no null
- billingPeriod: periodo facturado (ej. "MAR-ABR 2026"), si no null
- tariff: tarifa CFE si aparece (ej. "1C", "DAC"), si no null
- confidence: numero entre 0.0 y 1.0 segun tu certeza de la lectura

Reglas estrictas:
- No inventes ningun dato
- Si no puedes leer claramente un campo, pon null
- No calcules ahorro solar ni recomiendes paneles
- Devuelve unicamente el objeto JSON`;

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions,
        max_output_tokens: 500,
        input: [
          {
            role: 'user',
            content: buildUserContent({ contentType: parsedFile.contentType }, base64, isPdf),
          },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      console.error('OpenAI API error:', openaiResponse.status, errBody);
      return res.status(502).json({
        success: false,
        error: 'Error al conectar con el servicio de lectura. Intenta de nuevo.',
      });
    }

    const apiData = await openaiResponse.json();
    const rawText = extractOpenAIText(apiData);

    let parsed;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error('JSON parse error. Raw response:', rawText, 'Full response:', apiData);
      return res.status(200).json({
        success: false,
        error: 'No pudimos interpretar el recibo. Intenta con una foto mas clara o ingresa los datos manualmente.',
      });
    }

    const hasKwh = parsed.kwhBimonthly && Number(parsed.kwhBimonthly) > 0;
    const hasPaid = parsed.totalPaid && Number(parsed.totalPaid) > 0;

    if (!hasKwh && !hasPaid) {
      return res.status(200).json({
        success: false,
        error: 'No pudimos detectar los datos del recibo. Intenta con una foto mas clara o ingresa los datos manualmente.',
      });
    }

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
        !hasKwh ? 'No se detecto el consumo en kWh' : null,
        !hasPaid ? 'No se detecto el total pagado' : null,
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
