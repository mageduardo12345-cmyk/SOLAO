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

function buildUserContent(files) {
  const prompt = files.length > 1
      ? 'Los archivos están en este orden: primero frente, después reverso. Usa el frente para detectar el total a pagar y usa el reverso para leer la tabla de consumo histórico. Analízalos juntos para extraer los datos del mismo recibo CFE mexicano.'
      : 'Este es un recibo CFE mexicano. Extrae los datos.';

  const content = [];

  files.forEach((file, index) => {
    if (files.length > 1) {
      content.push({
        type: 'input_text',
        text: index === 0
          ? 'Archivo 1: frente del recibo CFE.'
          : 'Archivo 2: reverso del recibo CFE.',
      });
    }

    if (file.contentType === 'application/pdf') {
      content.push({
        type: 'input_file',
        filename: file.filename || `recibo-cfe-${index + 1}.pdf`,
        file_data: `data:${file.contentType};base64,${file.base64}`,
      });
      return;
    }

    content.push({
      type: 'input_image',
      image_url: `data:${file.contentType};base64,${file.base64}`,
    });
  });

  content.push({ type: 'input_text', text: prompt });
  return content;
}

function normalizePeriodHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const kwh = Number(item.kwhBimonthly);
      const totalPaid = Number(item.totalPaid);

      return {
        period: typeof item.period === 'string' && item.period.trim() ? item.period.trim() : null,
        kwhBimonthly: Number.isFinite(kwh) && kwh > 0 ? Math.round(kwh) : null,
        totalPaid: Number.isFinite(totalPaid) && totalPaid > 0 ? Math.round(totalPaid) : null,
        evidence: typeof item.evidence === 'string' && item.evidence.trim() ? item.evidence.trim() : null,
      };
    })
    .filter((item) => item && (item.period || item.kwhBimonthly || item.totalPaid || item.evidence))
    .slice(0, 6);
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
    const rawFiles = Array.isArray(body?.fileDataList)
      ? body.fileDataList
      : (body?.fileData ? [body.fileData] : []);
    const parsedFiles = rawFiles.map(parseDataUrl).filter(Boolean).slice(0, 2);

    if (!parsedFiles.length) {
      return res.status(400).json({
        success: false,
        error: 'No se recibio ningun archivo valido',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    for (const parsedFile of parsedFiles) {
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
          error: 'Uno de los archivos es demasiado pesado. Maximo 5MB por archivo.',
        });
      }
    }

    const files = parsedFiles.map((parsedFile, index) => ({
      contentType: parsedFile.contentType,
      base64: Buffer.from(parsedFile.base64, 'base64').toString('base64'),
      filename: parsedFile.contentType === 'application/pdf' ? `recibo-cfe-${index + 1}.pdf` : null,
    }));

    const instructions = `Eres un extractor de datos de recibos CFE de Mexico.
Analiza uno o dos archivos del mismo recibo CFE y devuelve unicamente JSON valido, sin texto extra, sin backticks y sin explicaciones.

Extrae exactamente estos campos:
- customerName: nombre del titular si aparece, si no null
- kwhBimonthly: consumo total del periodo en kWh como numero entero, si no null
- totalPaid: total a pagar en pesos mexicanos como numero sin signo $, si no null
- billingPeriod: periodo facturado (ej. "MAR-ABR 2026"), si no null
- tariff: tarifa CFE si aparece (ej. "1C", "DAC"), si no null
- confidence: numero entre 0.0 y 1.0 segun tu certeza global
- evidence: un objeto con las claves customerName, kwhBimonthly, totalPaid, billingPeriod y tariff; en cada una escribe el fragmento exacto del recibo donde viste ese dato, o null si no lo viste claramente
- periodHistory: una lista con solo los ultimos 6 periodos del cuadro historico del recibo, ordenada de mas reciente a mas antiguo. Cada elemento debe incluir period, kwhBimonthly, totalPaid y evidence. Si no aparece una tabla historica clara, usa []

Reglas estrictas:
- No inventes ningun dato
- Si no puedes leer claramente un campo, pon null
- No calcules ahorro solar ni recomiendes paneles
- Si el valor parece adivinado, pon null
- Usa todas las imagenes/documentos proporcionados juntos; si hay frente y reverso, usa el frente para el total pagado y el reverso para el historial
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
            content: buildUserContent(files),
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
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;
    const periodHistory = normalizePeriodHistory(parsed.periodHistory);

    const normalizedData = {
      customerName: parsed.customerName || null,
      kwhBimonthly: hasKwh ? Number(parsed.kwhBimonthly) : null,
      totalPaid: hasPaid ? Number(parsed.totalPaid) : null,
      billingPeriod: parsed.billingPeriod || null,
      tariff: parsed.tariff || null,
      confidence,
      evidence: parsed.evidence && typeof parsed.evidence === 'object' ? parsed.evidence : null,
      periodHistory,
    };

    const warnings = [
      !hasKwh ? 'No se detecto el consumo en kWh' : null,
      !hasPaid ? 'No se detecto el total pagado' : null,
      confidence !== null && confidence < 0.8 ? 'La lectura pudo ser parcial' : null,
      confidence !== null && confidence < 0.5 ? 'La certeza del modelo fue baja' : null,
      periodHistory.length < 2 ? 'No se detectaron suficientes periodos historicos' : null,
    ].filter(Boolean);

    if (!hasKwh && !hasPaid && periodHistory.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No pudimos detectar los datos del recibo. Intenta con una foto mas clara o ingresa los datos manualmente.',
      });
    }

    return res.status(200).json({
      success: true,
      data: normalizedData,
      warnings,
    });
  } catch (err) {
    console.error('Error inesperado en read-cfe:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno. Por favor intenta de nuevo o ingresa los datos manualmente.',
    });
  }
}
