import { v1, helpers } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getStorage } from '@/lib/gcs';

// VERSION MARKER - Used to verify which code version is deployed
// BUILD_TIMESTAMP forces Vercel to create fresh serverless instances
const BUILD_TIMESTAMP = '2026-01-27T20:00:00Z';
const AI_SERVICE_VERSION = 'v2.9.5-DIAGNOSTIC-ERROR-SOURCE';
console.log(`\n\n${'='.repeat(80)}`);
console.log(`[AIService] 🚀 MODULE LOAD - VERSION: ${AI_SERVICE_VERSION}`);
console.log(`[AIService] 📅 BUILD_TIMESTAMP: ${BUILD_TIMESTAMP}`);
console.log(`[AIService] ✅ AI PROVIDER: GEMINI EXCLUSIVELY`);
console.log(`[AIService] ❌ ANTHROPIC: SDK NOT INSTALLED, NO IMPORTS, NO CALLS`);
console.log(`[AIService] ⚠️  If you see Anthropic 401 errors, you are running OLD CACHED CODE`);
console.log(`[AIService] 🔧 Solution: Delete .next folder, run 'npm run build', redeploy to Vercel`);
console.log(`${'='.repeat(80)}\n\n`);

/**
 * AI Service v2.8.0 - GEMINI ONLY
 *
 * ALL AI generation now uses GEMINI exclusively.
 * This eliminates all Anthropic dependencies and the 401 errors from stale Vercel instances.
 */

// Initialize clients
const { PredictionServiceClient } = v1;

interface GenerateCopyMasterParams {
  offerName: string;
  offerDescription?: string;
  vertical?: string;
  country: string;
  language: string;
  apiKey?: string;
}

interface GenerateKeywordsParams {
  offerName: string;
  copyMaster: string;
  count?: number; // 3-10, default 6
  country: string;
  apiKey?: string;
}

interface GenerateArticleParams {
  offerName: string;
  copyMaster: string;
  keywords: string[];
  country: string;
  language: string;
  apiKey?: string;
}

interface GenerateAdCopyParams {
  offerName: string;
  copyMaster: string;
  platform: 'META' | 'TIKTOK';
  adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  targetAudience?: string;
  country: string;
  language: string;
  apiKey?: string;
}

interface GenerateImageParams {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  apiKey?: string;
}

interface GenerateUGCMediaParams {
  campaignId: string;
  platform: 'META' | 'TIKTOK';
  mediaType: 'IMAGE' | 'VIDEO' | 'BOTH';
  count: number;
  category: string;
  country: string;
  language: string;
  adTitle: string;
  copyMaster: string;
  offerName?: string;
  vertical?: string;
  apiKey?: string;
}

interface GenerateVideoParams {
  prompt: string;
  durationSeconds?: number; // 1-8 seconds for Veo 3.1 Fast
  aspectRatio?: '16:9' | '9:16' | '1:1';
  fromImageUrl?: string; // Optional: generate video from image
}

// UGC Style Prompt Configuration
interface UGCPromptParams {
  category: string;       // e.g., "Autos usados", "Préstamos personales"
  country: string;        // e.g., "Colombia", "México"
  language: string;       // e.g., "es", "en", "pt"
  adTitle: string;        // The ad headline/title (COPY for images)
  copyMaster: string;     // The copy master text (for videos)
  offerName?: string;     // Specific offer name for context
  vertical?: string;      // Vertical category from Tonic
}

// Country name mappings for prompts
const COUNTRY_NAMES: Record<string, string> = {
  'MX': 'México',
  'CO': 'Colombia',
  'AR': 'Argentina',
  'ES': 'España',
  'CL': 'Chile',
  'PE': 'Perú',
  'VE': 'Venezuela',
  'EC': 'Ecuador',
  'US': 'Estados Unidos',
  'BR': 'Brasil',
  'PT': 'Portugal',
  'UK': 'Reino Unido',
  'GB': 'Reino Unido',
  'JP': 'Japón',
  'KR': 'Corea del Sur',
  'CN': 'China',
  'AU': 'Australia',
  'CA': 'Canadá',
  'FR': 'Francia',
  'DE': 'Alemania',
  'IT': 'Italia',
};

// Language name mappings for prompts
const LANGUAGE_NAMES: Record<string, string> = {
  'es': 'español',
  'spanish': 'español',
  'en': 'inglés',
  'english': 'inglés',
  'pt': 'portugués',
  'portuguese': 'portugués',
  'ja': 'japonés',
  'japanese': 'japonés',
  'ko': 'coreano',
  'korean': 'coreano',
  'zh': 'chino',
  'chinese': 'chino',
  'fr': 'francés',
  'french': 'francés',
  'de': 'alemán',
  'german': 'alemán',
  'it': 'italiano',
  'italian': 'italiano',
  'ar': 'árabe',
  'arabic': 'árabe',
};

// ============================================
// VERTICAL TEMPLATES SYSTEM
// Defines visual guidelines for each vertical
// ============================================

interface VerticalTemplate {
  name: string;
  keywords: string[];  // Keywords to match this vertical
  visualStyle: {
    subjects: string[];      // What/who should appear in the image
    settings: string[];      // Where the scene takes place
    props: string[];         // Objects that should be visible
    mood: string;            // Emotional tone
    colors: string[];        // Dominant color palette
    lighting: string;        // Lighting style
  };
  adStyle: {
    tone: string;            // Professional, casual, urgent, etc.
    callToAction: string;    // Type of CTA that works best
  };
}

const VERTICAL_TEMPLATES: Record<string, VerticalTemplate> = {
  // FINANCE VERTICALS
  'finance_loans': {
    name: 'Préstamos / Loans',
    keywords: ['loan', 'préstamo', 'crédito', 'credit', 'lending', 'borrow', 'dinero rápido', 'quick cash', 'personal loan'],
    visualStyle: {
      subjects: ['persona sonriendo con dinero en mano', 'familia feliz en casa nueva', 'persona usando celular para transferencia'],
      settings: ['sala de casa modesta pero acogedora', 'oficina de banco', 'exterior de casa'],
      props: ['billetes de moneda local', 'celular mostrando app bancaria', 'documentos de aprobación', 'llaves de casa'],
      mood: 'esperanzador, alivio financiero, confianza',
      colors: ['verde dinero', 'azul confianza', 'blanco limpio'],
      lighting: 'iluminación cálida natural, sensación de hogar'
    },
    adStyle: {
      tone: 'confiable y accesible',
      callToAction: 'Solicita ahora, Aprobación rápida'
    }
  },
  'finance_insurance': {
    name: 'Seguros / Insurance',
    keywords: ['insurance', 'seguro', 'cobertura', 'coverage', 'protección', 'protection', 'póliza', 'policy'],
    visualStyle: {
      subjects: ['familia protegida bajo techo', 'persona mayor tranquila', 'auto protegido'],
      settings: ['hogar seguro', 'hospital', 'carretera'],
      props: ['paraguas protector', 'escudo', 'documentos de póliza', 'auto'],
      mood: 'seguridad, tranquilidad, protección familiar',
      colors: ['azul seguridad', 'verde estabilidad', 'blanco pureza'],
      lighting: 'luz suave y reconfortante'
    },
    adStyle: {
      tone: 'protector y tranquilizador',
      callToAction: 'Protege a tu familia, Cotiza gratis'
    }
  },
  'finance_cards': {
    name: 'Tarjetas de Crédito / Credit Cards',
    keywords: ['credit card', 'tarjeta de crédito', 'tarjeta', 'card', 'rewards', 'cashback', 'puntos'],
    visualStyle: {
      subjects: ['persona haciendo compra con tarjeta', 'joven viajando', 'persona en tienda'],
      settings: ['centro comercial', 'aeropuerto', 'restaurante elegante', 'tienda online'],
      props: ['tarjeta de crédito brillante', 'bolsas de compras', 'pasaporte', 'celular con app'],
      mood: 'libertad financiera, estilo de vida aspiracional',
      colors: ['dorado premium', 'negro elegante', 'plateado'],
      lighting: 'iluminación premium, brillos en la tarjeta'
    },
    adStyle: {
      tone: 'aspiracional pero alcanzable',
      callToAction: 'Solicita tu tarjeta, Beneficios exclusivos'
    }
  },

  // AUTOMOTIVE VERTICALS
  'auto_used': {
    name: 'Autos Usados / Used Cars',
    keywords: ['used car', 'auto usado', 'carro usado', 'seminuevo', 'second hand', 'pre-owned', 'vehículo'],
    visualStyle: {
      subjects: ['persona inspeccionando auto', 'familia junto a auto', 'vendedor mostrando auto'],
      settings: ['lote de autos', 'estacionamiento', 'calle residencial', 'concesionaria'],
      props: ['auto sedán o SUV popular', 'llaves de auto', 'documentos de venta', 'cartel de precio'],
      mood: 'oportunidad, buen negocio, emoción de compra',
      colors: ['rojo auto', 'azul metálico', 'blanco', 'plateado'],
      lighting: 'luz de día exterior, el auto debe verse brillante'
    },
    adStyle: {
      tone: 'oportunidad urgente, buen trato',
      callToAction: 'Ver ofertas, Agenda prueba de manejo'
    }
  },
  'auto_rental': {
    name: 'Renta de Autos / Car Rental',
    keywords: ['car rental', 'renta de auto', 'alquiler', 'rent a car', 'rental'],
    visualStyle: {
      subjects: ['turista recogiendo auto', 'persona de negocios en aeropuerto', 'familia en road trip'],
      settings: ['aeropuerto', 'mostrador de renta', 'carretera escénica', 'ciudad turística'],
      props: ['auto moderno', 'maletas', 'mapa o GPS', 'llaves'],
      mood: 'aventura, libertad, viaje',
      colors: ['azul cielo', 'amarillo sol', 'verde naturaleza'],
      lighting: 'luz brillante de día, sensación de vacaciones'
    },
    adStyle: {
      tone: 'conveniente y emocionante',
      callToAction: 'Reserva ahora, Mejores tarifas'
    }
  },
  'auto_parts': {
    name: 'Autopartes / Auto Parts',
    keywords: ['auto parts', 'autopartes', 'refacciones', 'repuestos', 'spare parts', 'car parts'],
    visualStyle: {
      subjects: ['mecánico trabajando', 'persona instalando pieza', 'dueño de auto orgulloso'],
      settings: ['taller mecánico', 'garage casero', 'tienda de autopartes'],
      props: ['piezas de auto', 'herramientas', 'motor', 'llantas', 'aceite'],
      mood: 'confianza técnica, ahorro, DIY',
      colors: ['negro industrial', 'naranja mecánico', 'gris metal'],
      lighting: 'luz de taller, práctica'
    },
    adStyle: {
      tone: 'experto y económico',
      callToAction: 'Encuentra tu pieza, Envío gratis'
    }
  },

  // EDUCATION VERTICALS
  'education_scholarships': {
    name: 'Becas / Scholarships',
    keywords: ['scholarship', 'beca', 'becas', 'financial aid', 'ayuda financiera', 'estudiar gratis', 'universidad'],
    visualStyle: {
      subjects: ['estudiante graduándose', 'joven estudiando feliz', 'grupo de estudiantes diversos'],
      settings: ['campus universitario', 'biblioteca', 'ceremonia de graduación', 'aula'],
      props: ['toga y birrete', 'libros', 'diploma', 'laptop', 'mochila'],
      mood: 'esperanza, logro, futuro brillante',
      colors: ['azul académico', 'dorado éxito', 'verde esperanza'],
      lighting: 'luz inspiradora, rayos de sol'
    },
    adStyle: {
      tone: 'inspirador y alcanzable',
      callToAction: 'Aplica ahora, Cumple tu sueño'
    }
  },
  'education_courses': {
    name: 'Cursos Online / Online Courses',
    keywords: ['course', 'curso', 'online learning', 'capacitación', 'training', 'certification', 'certificación'],
    visualStyle: {
      subjects: ['persona estudiando en laptop', 'profesional tomando notas', 'estudiante con certificado'],
      settings: ['home office', 'café', 'escritorio moderno'],
      props: ['laptop', 'audífonos', 'cuaderno', 'café', 'certificado'],
      mood: 'superación personal, flexibilidad, crecimiento',
      colors: ['azul tecnología', 'naranja energía', 'blanco limpio'],
      lighting: 'luz de pantalla, ambiente de estudio'
    },
    adStyle: {
      tone: 'accesible y profesional',
      callToAction: 'Inscríbete hoy, Aprende a tu ritmo'
    }
  },
  'education_degrees': {
    name: 'Títulos Universitarios / University Degrees',
    keywords: ['degree', 'título', 'universidad', 'university', 'college', 'carrera', 'licenciatura', 'maestría'],
    visualStyle: {
      subjects: ['estudiante en campus', 'graduado exitoso', 'profesional joven'],
      settings: ['campus universitario prestigioso', 'aula moderna', 'biblioteca'],
      props: ['edificios universitarios', 'libros', 'laptop', 'toga'],
      mood: 'prestigio, inversión en futuro, orgullo',
      colors: ['azul marino institucional', 'dorado', 'blanco'],
      lighting: 'luz clásica institucional'
    },
    adStyle: {
      tone: 'prestigioso pero accesible',
      callToAction: 'Conoce nuestros programas, Solicita información'
    }
  },

  // HEALTH VERTICALS
  'health_medical': {
    name: 'Servicios Médicos / Medical Services',
    keywords: ['medical', 'médico', 'doctor', 'clinic', 'clínica', 'health', 'salud', 'hospital', 'treatment'],
    visualStyle: {
      subjects: ['doctor amable con paciente', 'enfermera sonriendo', 'paciente recuperándose'],
      settings: ['consultorio médico limpio', 'hospital moderno', 'sala de espera'],
      props: ['bata blanca', 'estetoscopio', 'equipos médicos', 'receta'],
      mood: 'confianza, cuidado, profesionalismo',
      colors: ['blanco limpieza', 'azul médico', 'verde salud'],
      lighting: 'luz clínica pero cálida'
    },
    adStyle: {
      tone: 'profesional y empático',
      callToAction: 'Agenda tu cita, Consulta gratis'
    }
  },
  'health_dental': {
    name: 'Dental / Dentist',
    keywords: ['dental', 'dentista', 'teeth', 'dientes', 'smile', 'sonrisa', 'orthodontics', 'ortodoncia'],
    visualStyle: {
      subjects: ['persona con sonrisa perfecta', 'dentista trabajando', 'antes y después dental'],
      settings: ['consultorio dental moderno', 'espejo mostrando sonrisa'],
      props: ['cepillo de dientes', 'hilo dental', 'silla dental', 'radiografía'],
      mood: 'confianza, belleza, salud',
      colors: ['blanco brillante', 'azul claro', 'menta'],
      lighting: 'luz brillante que resalta sonrisas'
    },
    adStyle: {
      tone: 'transformador y profesional',
      callToAction: 'Sonríe con confianza, Evaluación gratis'
    }
  },
  'health_weight': {
    name: 'Pérdida de Peso / Weight Loss',
    keywords: ['weight loss', 'pérdida de peso', 'diet', 'dieta', 'fitness', 'adelgazar', 'slim', 'gym'],
    visualStyle: {
      subjects: ['persona midiendo cintura', 'transformación antes/después', 'persona haciendo ejercicio'],
      settings: ['gimnasio', 'cocina saludable', 'parque haciendo ejercicio'],
      props: ['cinta métrica', 'ropa deportiva', 'comida saludable', 'báscula', 'pesas'],
      mood: 'transformación, motivación, logro',
      colors: ['verde salud', 'naranja energía', 'azul agua'],
      lighting: 'luz energética, motivadora'
    },
    adStyle: {
      tone: 'motivador y realista',
      callToAction: 'Comienza hoy, Resultados garantizados'
    }
  },

  // HOME & SERVICES
  'home_solar': {
    name: 'Energía Solar / Solar Energy',
    keywords: ['solar', 'paneles solares', 'solar panels', 'energy', 'energía', 'renewable', 'renovable'],
    visualStyle: {
      subjects: ['casa con paneles solares', 'familia ahorrando', 'instalador en techo'],
      settings: ['techo de casa residencial', 'vecindario soleado', 'factura de luz'],
      props: ['paneles solares', 'sol brillante', 'factura reducida', 'casa moderna'],
      mood: 'ahorro, ecología, futuro',
      colors: ['azul cielo', 'amarillo sol', 'verde eco'],
      lighting: 'luz solar brillante, día perfecto'
    },
    adStyle: {
      tone: 'económico y ecológico',
      callToAction: 'Ahorra en tu factura, Cotización gratis'
    }
  },
  'home_improvement': {
    name: 'Mejoras del Hogar / Home Improvement',
    keywords: ['home improvement', 'remodelación', 'renovation', 'kitchen', 'cocina', 'bathroom', 'baño', 'remodel'],
    visualStyle: {
      subjects: ['familia en cocina nueva', 'contratista trabajando', 'antes y después de remodelación'],
      settings: ['cocina moderna', 'baño renovado', 'sala remodelada'],
      props: ['herramientas', 'planos', 'muestras de materiales', 'pintura'],
      mood: 'transformación del hogar, orgullo, valor',
      colors: ['blanco limpio', 'gris moderno', 'madera natural'],
      lighting: 'luz de showroom, espacios amplios'
    },
    adStyle: {
      tone: 'aspiracional y práctico',
      callToAction: 'Transforma tu hogar, Presupuesto gratis'
    }
  },
  'home_moving': {
    name: 'Mudanzas / Moving Services',
    keywords: ['moving', 'mudanza', 'relocation', 'mover', 'packing', 'embalaje'],
    visualStyle: {
      subjects: ['familia empacando', 'camión de mudanza', 'trabajadores cargando cajas'],
      settings: ['casa en proceso de mudanza', 'camión estacionado', 'nueva casa vacía'],
      props: ['cajas de cartón', 'cinta de embalaje', 'muebles', 'camión'],
      mood: 'nuevo comienzo, emoción, organización',
      colors: ['marrón cartón', 'azul confianza', 'blanco'],
      lighting: 'luz de día, actividad'
    },
    adStyle: {
      tone: 'confiable y eficiente',
      callToAction: 'Cotiza tu mudanza, Sin estrés'
    }
  },

  // LEGAL VERTICALS
  'legal_injury': {
    name: 'Accidentes / Personal Injury',
    keywords: ['injury', 'accident', 'accidente', 'lawyer', 'abogado', 'compensation', 'compensación', 'lawsuit'],
    visualStyle: {
      subjects: ['persona con yeso', 'abogado profesional', 'cliente recibiendo cheque'],
      settings: ['oficina de abogado', 'hospital', 'escena de accidente'],
      props: ['documentos legales', 'maletín', 'yeso o vendaje', 'cheque grande'],
      mood: 'justicia, recuperación, apoyo',
      colors: ['azul marino profesional', 'dorado justicia', 'blanco'],
      lighting: 'luz seria pero esperanzadora'
    },
    adStyle: {
      tone: 'empático y profesional',
      callToAction: 'Consulta gratis, Luchamos por ti'
    }
  },
  'legal_immigration': {
    name: 'Inmigración / Immigration',
    keywords: ['immigration', 'inmigración', 'visa', 'green card', 'citizenship', 'ciudadanía', 'residencia'],
    visualStyle: {
      subjects: ['familia reunida', 'persona con pasaporte', 'ceremonia de ciudadanía'],
      settings: ['aeropuerto', 'oficina de inmigración', 'nuevo hogar'],
      props: ['pasaporte', 'bandera', 'documentos', 'maletas'],
      mood: 'esperanza, reunión familiar, nuevo comienzo',
      colors: ['azul cielo', 'rojo y blanco', 'verde esperanza'],
      lighting: 'luz emotiva, cálida'
    },
    adStyle: {
      tone: 'esperanzador y profesional',
      callToAction: 'Consulta tu caso, Reunimos familias'
    }
  },

  // ECOMMERCE & RETAIL
  'retail_shopping': {
    name: 'Compras / Shopping',
    keywords: ['shopping', 'compras', 'deals', 'ofertas', 'discount', 'descuento', 'sale', 'tienda'],
    visualStyle: {
      subjects: ['persona con bolsas de compras', 'unboxing', 'comprando online'],
      settings: ['centro comercial', 'tienda', 'casa recibiendo paquete'],
      props: ['bolsas de compras', 'cajas de paquetes', 'tarjeta de crédito', 'celular'],
      mood: 'emoción, satisfacción, buen trato',
      colors: ['rojo oferta', 'amarillo atención', 'negro elegante'],
      lighting: 'luz de tienda, atractiva'
    },
    adStyle: {
      tone: 'urgente y emocionante',
      callToAction: 'Compra ahora, Oferta limitada'
    }
  },

  // DEFAULT / FALLBACK
  'default': {
    name: 'General',
    keywords: [],
    visualStyle: {
      subjects: ['persona local interactuando con producto/servicio', 'escena cotidiana relevante'],
      settings: ['ambiente típico del país', 'contexto urbano o residencial apropiado'],
      props: ['elementos relacionados con la oferta', 'objetos cotidianos del país'],
      mood: 'positivo, auténtico, confiable',
      colors: ['colores que resuenan con la cultura local'],
      lighting: 'luz natural, realista'
    },
    adStyle: {
      tone: 'auténtico y directo',
      callToAction: 'Descubre más, Aprovecha ahora'
    }
  }
};

/**
 * Classify vertical based on offer name and category
 * Returns the matching vertical template key
 */
function classifyVertical(offerName: string, category: string, vertical?: string): string {
  const searchText = `${offerName} ${category} ${vertical || ''}`.toLowerCase();

  // Score each vertical by keyword matches
  let bestMatch = 'default';
  let bestScore = 0;

  for (const [key, template] of Object.entries(VERTICAL_TEMPLATES)) {
    if (key === 'default') continue;

    let score = 0;
    for (const keyword of template.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score += keyword.length; // Longer matches = higher score
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = key;
    }
  }

  return bestMatch;
}

/**
 * Get vertical template by key
 */
function getVerticalTemplate(verticalKey: string): VerticalTemplate {
  return VERTICAL_TEMPLATES[verticalKey] || VERTICAL_TEMPLATES['default'];
}

/**
 * Build intelligent UGC image prompt using vertical templates
 * Uses a hybrid approach: template base + campaign-specific refinement
 */
function buildUGCImagePrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  // Classify the vertical
  const verticalKey = classifyVertical(
    params.offerName || params.category,
    params.category,
    params.vertical
  );
  const template = getVerticalTemplate(verticalKey);

  // Select random elements from template for variety
  const subject = template.visualStyle.subjects[Math.floor(Math.random() * template.visualStyle.subjects.length)];
  const setting = template.visualStyle.settings[Math.floor(Math.random() * template.visualStyle.settings.length)];
  const props = template.visualStyle.props.slice(0, 2).join(', ');
  const colors = template.visualStyle.colors.slice(0, 2).join(' y ');

  return `Foto cuadrada 1080x1080 estilo anuncio de redes sociales para ${params.category} en ${countryName}.

ESCENA: ${subject} en ${setting}. Ambiente auténtico de ${countryName} con detalles culturales locales.

ELEMENTOS VISUALES: ${props} visibles naturalmente en la escena. Paleta de colores dominante: ${colors}.

ESTILO VISUAL: Foto de alta calidad pero con aspecto natural y auténtico (no stock photo). ${template.visualStyle.lighting}. Composición atractiva para scroll de redes sociales. ${template.visualStyle.mood}.

TEXTO SUPERPUESTO: Incluir texto grande y legible en ${languageName} que diga exactamente: "${params.adTitle}". El texto debe tener estilo nativo de Instagram/Facebook ads con fondo semi-transparente o sombra para legibilidad.

IMPORTANTE: La imagen debe verse como un anuncio real y efectivo, no como una foto amateur. Debe captar la atención y comunicar claramente el mensaje de ${template.name.toLowerCase()}.`;
}

/**
 * Build intelligent UGC video prompt using vertical templates
 */
function buildUGCVideoPrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  // Classify the vertical
  const verticalKey = classifyVertical(
    params.offerName || params.category,
    params.category,
    params.vertical
  );
  const template = getVerticalTemplate(verticalKey);

  const subject = template.visualStyle.subjects[Math.floor(Math.random() * template.visualStyle.subjects.length)];
  const setting = template.visualStyle.settings[Math.floor(Math.random() * template.visualStyle.settings.length)];
  const props = template.visualStyle.props.slice(0, 2).join(', ');

  return `Video vertical 9:16 formato TikTok/Reels para ${params.category} en ${countryName}.

ESCENA: ${subject} en ${setting}. Mostrar ${props} de forma natural.

ESTILO: Video con movimiento suave pero dinámico. Puede ser estilo testimonial, demostración, o escena de vida real. ${template.visualStyle.lighting}. Colores vibrantes que capten atención en el feed.

TONO: ${template.visualStyle.mood}. El video debe transmitir ${template.adStyle.tone}.

TEXTO: Durante todo el video, mostrar texto superpuesto en ${languageName} que diga: "${params.copyMaster}". Estilo de caption de TikTok/Reels con animación sutil.

DURACIÓN: 5 segundos de contenido atractivo que cuente una mini-historia visual sobre ${template.name.toLowerCase()}.

IMPORTANTE: El video debe verse profesional pero auténtico, capaz de detener el scroll y generar interés inmediato.`;
}

/**
 * Build video thumbnail prompt using vertical templates
 */
function buildVideoThumbnailPrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  // Classify the vertical
  const verticalKey = classifyVertical(
    params.offerName || params.category,
    params.category,
    params.vertical
  );
  const template = getVerticalTemplate(verticalKey);

  const subject = template.visualStyle.subjects[0];
  const colors = template.visualStyle.colors.slice(0, 2).join(' y ');

  return `Thumbnail de video para ${params.category} en ${countryName}.

ESCENA: Captura llamativa de ${subject}. Expresión o momento que genere curiosidad.

ESTILO: Imagen vertical 9:16 estilo thumbnail de TikTok/Reels. Colores: ${colors}. Alto contraste y saturación para destacar en el feed.

TEXTO: Texto grande y llamativo en ${languageName}: "${params.adTitle}". Debe ser completamente legible en tamaño pequeño.

ELEMENTOS: Incluir sutilmente un ícono de play para indicar que es video.

IMPORTANTE: El thumbnail debe generar curiosidad y deseo de ver el video. Debe destacar entre otros contenidos del feed.`;
}

// Force rebuild: 2026-01-12T22:45:00Z
class AIService {
  private _vertexAiClient: any | null = null;
  private _geminiClient: GoogleGenAI | null = null;
  private _storage: Storage | null = null;

  // Lazy getter for Gemini client - initializes on first use, not at module load
  private get geminiClient(): GoogleGenAI {
    if (!this._geminiClient) {
      const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

      if (!apiKey) {
        throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable is required');
      }

      if (apiKey.startsWith('sk-ant')) {
        throw new Error('CRITICAL: GEMINI_API_KEY contains an Anthropic key (sk-ant). Use a valid Google Gemini API key.');
      }

      this._geminiClient = new GoogleGenAI({ apiKey });
      logger.info('ai', 'Gemini client initialized (lazy)');
    }
    return this._geminiClient;
  }

  // Lazy getter for Vertex AI client
  private get vertexAiClient(): any {
    if (!this._vertexAiClient) {
      const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
      let vertexAiOptions: any = {
        apiEndpoint: `${env.GCP_LOCATION}-aiplatform.googleapis.com`,
      };

      if (credentialsJson) {
        try {
          const credentials = JSON.parse(credentialsJson);
          vertexAiOptions.credentials = credentials;
          vertexAiOptions.projectId = credentials.project_id;
          logger.info('ai', `Vertex AI initialized with service account: ${credentials.client_email}`);
        } catch (e: any) {
          logger.error('ai', `Failed to parse GCP_SERVICE_ACCOUNT_KEY: ${e.message}`);
        }
      } else {
        logger.warn('ai', 'GCP_SERVICE_ACCOUNT_KEY not found, using default credentials');
      }

      this._vertexAiClient = new PredictionServiceClient(vertexAiOptions);
    }
    return this._vertexAiClient;
  }

  // Lazy getter for Storage client
  private get storage(): Storage {
    if (!this._storage) {
      this._storage = getStorage();
      logger.info('ai', 'Storage client initialized (lazy)');
    }
    return this._storage;
  }

  /**
   * Get language name and instruction based on language code
   * Supports: en, es, pt, it, fr, de, nl, pl and any other language
   */
  private getLanguageInfo(langCode: string, originalParam: string): { languageName: string; languageInstruction: string } {
    const lang = langCode.toLowerCase();

    const languageMap: Record<string, { name: string; instruction: string }> = {
      'en': { name: 'English', instruction: 'WRITE ENTIRELY IN ENGLISH.' },
      'english': { name: 'English', instruction: 'WRITE ENTIRELY IN ENGLISH.' },
      'es': { name: 'Spanish', instruction: 'WRITE ENTIRELY IN SPANISH.' },
      'spanish': { name: 'Spanish', instruction: 'WRITE ENTIRELY IN SPANISH.' },
      'pt': { name: 'Portuguese', instruction: 'WRITE ENTIRELY IN PORTUGUESE.' },
      'portuguese': { name: 'Portuguese', instruction: 'WRITE ENTIRELY IN PORTUGUESE.' },
      'it': { name: 'Italian', instruction: 'WRITE ENTIRELY IN ITALIAN.' },
      'italian': { name: 'Italian', instruction: 'WRITE ENTIRELY IN ITALIAN.' },
      'fr': { name: 'French', instruction: 'WRITE ENTIRELY IN FRENCH.' },
      'french': { name: 'French', instruction: 'WRITE ENTIRELY IN FRENCH.' },
      'de': { name: 'German', instruction: 'WRITE ENTIRELY IN GERMAN.' },
      'german': { name: 'German', instruction: 'WRITE ENTIRELY IN GERMAN.' },
      'nl': { name: 'Dutch', instruction: 'WRITE ENTIRELY IN DUTCH.' },
      'dutch': { name: 'Dutch', instruction: 'WRITE ENTIRELY IN DUTCH.' },
      'pl': { name: 'Polish', instruction: 'WRITE ENTIRELY IN POLISH.' },
      'polish': { name: 'Polish', instruction: 'WRITE ENTIRELY IN POLISH.' },
    };

    const mapped = languageMap[lang];
    if (mapped) {
      return { languageName: mapped.name, languageInstruction: mapped.instruction };
    }

    // For any other language, use the parameter directly (never default to Spanish)
    const capitalizedLang = originalParam.charAt(0).toUpperCase() + originalParam.slice(1).toLowerCase();
    return {
      languageName: capitalizedLang,
      languageInstruction: `WRITE ENTIRELY IN ${originalParam.toUpperCase()}.`
    };
  }

  constructor() {
    // Lazy initialization - all clients are created on first use
    // This allows the module to load during build time without API keys (required for Cloud Run Docker build)
    console.log(`[AIService] Constructor called - VERSION: ${AI_SERVICE_VERSION}`);
    console.log(`[AIService] BUILD_TIMESTAMP: ${BUILD_TIMESTAMP}`);
    console.log(`[AIService] ✅ Using LAZY INITIALIZATION for Cloud Run compatibility`);
    console.log(`[AIService] ❌ ANTHROPIC: SDK NOT INSTALLED - If you see 401 Anthropic errors, you are running OLD CODE`);
  }

  // ============================================
  // TEXT GENERATION (Google Gemini)
  // ============================================

  /**
   * Generate Copy Master - the main communication angle aligned with the offer
   */
  async generateCopyMaster(params: GenerateCopyMasterParams): Promise<string> {
    const model = 'gemini-2.0-flash';

    // Determine the base language from the language parameter
    const lang = params.language.toLowerCase();
    const isEnglish = lang === 'en' || lang === 'english';
    const isPortuguese = lang === 'pt' || lang === 'portuguese';
    const isSpanish = lang === 'es' || lang === 'spanish' || (!isEnglish && !isPortuguese);

    // Map countries to their specific dialect rules
    const spanishDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms. Never use "vos" or Argentine forms.',
      'CO': 'Colombian Spanish: Use "tú/usted" forms. Formal and clear.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "querés", "podés").',
      'ES': 'European Spanish: Use "tú/vosotros" forms.',
      'CL': 'Chilean Spanish: Use "tú" forms.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms.',
      'VE': 'Venezuelan Spanish: Use "tú/usted" forms.',
      'EC': 'Ecuadorian Spanish: Use "tú/usted" forms.',
    };

    const englishDialectRules: Record<string, string> = {
      'US': 'American English: Use US spelling (e.g., "color", "organize").',
      'UK': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'GB': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'AU': 'Australian English: Use Australian conventions.',
      'CA': 'Canadian English: Mix of US/UK spelling.',
    };

    const portugueseDialectRules: Record<string, string> = {
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese.',
      'PT': 'European Portuguese: Use European Portuguese.',
    };

    let dialectRule: string;
    let languageInstruction: string;

    if (isEnglish) {
      dialectRule = englishDialectRules[params.country] || 'American English: Use US spelling.';
      languageInstruction = 'WRITE IN ENGLISH.';
    } else if (isPortuguese) {
      dialectRule = portugueseDialectRules[params.country] || 'Brazilian Portuguese: Use standard Brazilian Portuguese.';
      languageInstruction = 'WRITE IN PORTUGUESE.';
    } else {
      dialectRule = spanishDialectRules[params.country] || 'Neutral Spanish: Use "tú/usted" forms.';
      languageInstruction = 'WRITE IN SPANISH.';
    }

    logger.info('ai', `[Gemini] Generating copy master in ${isEnglish ? 'English' : isPortuguese ? 'Portuguese' : 'Spanish'} for country ${params.country}`);

    const prompt = `You are an expert digital marketing copywriter specialized in creating compelling copy masters for advertising campaigns.

A Copy Master is the central communication message that defines the angle and tone of an advertising campaign.

CRITICAL REQUIREMENTS:
- ${languageInstruction}
- Perfect spelling and grammar (zero tolerance for errors)
- ${dialectRule}
- Use formal or semi-formal tone (NEVER informal/casual)
- NO exaggerated claims (e.g., "guaranteed", "100%", "always")
- NO invented statistics or fake data
- Truthful, realistic, and professional language
- Aligned with the offer's value proposition
- Culturally relevant for the target country
- Emotionally compelling but honest
- Concise (2-3 sentences max)

Create a Copy Master for the following advertising campaign:

Offer: ${params.offerName}
${params.offerDescription ? `Description: ${params.offerDescription}` : ''}
${params.vertical ? `Vertical: ${params.vertical}` : ''}
Target Country: ${params.country}
Language: ${params.language}

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ${dialectRule}

Generate a compelling Copy Master that:
- Is written ENTIRELY in ${isEnglish ? 'English' : isPortuguese ? 'Portuguese' : 'Spanish'}
- Uses perfect grammar for ${params.country}
- Uses formal/semi-formal tone
- Makes NO exaggerated claims
- Is truthful and professional
- Captures the essence of this offer and resonates with the target audience

Return ONLY the copy master text, nothing else.`;

    try {
      const response = await this.geminiClient.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const copyMaster = text.trim();

      if (!copyMaster) {
        throw new Error('Gemini returned empty copy master');
      }

      logger.success('ai', `[Gemini] Copy master generated successfully`);

      // Save to database
      await this.saveAIContent({
        contentType: 'copy_master',
        content: { copyMaster },
        model: 'gemini-2.0-flash',
        prompt: prompt,
      });

      return copyMaster;
    } catch (error: any) {
      logger.error('ai', `[Gemini] Copy master generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate Keywords for Tonic campaigns
   * v2.8.0 - NOW USES GEMINI (no more Anthropic)
   */
  async generateKeywords(params: GenerateKeywordsParams): Promise<string[]> {
    const model = 'gemini-2.0-flash';

    // Map country codes to full names and regional context
    const countryContext: Record<string, { name: string; language: string; regionalNotes: string }> = {
      'MX': { name: 'México', language: 'Spanish (Mexican)', regionalNotes: 'Use Mexican Spanish terminology. Example: "carro" instead of "coche", "computadora" instead of "ordenador". Include city references like Ciudad de México, Guadalajara, Monterrey when relevant.' },
      'CO': { name: 'Colombia', language: 'Spanish (Colombian)', regionalNotes: 'Use Colombian Spanish terminology. Example: "carro" or "vehículo", "computador". Include city references like Bogotá, Medellín, Cali when relevant.' },
      'AR': { name: 'Argentina', language: 'Spanish (Argentine)', regionalNotes: 'Use Argentine Spanish terminology. Example: "auto", "computadora". Include city references like Buenos Aires, Córdoba, Rosario when relevant.' },
      'ES': { name: 'España', language: 'Spanish (European)', regionalNotes: 'Use European Spanish terminology. Example: "coche", "ordenador". Include city references like Madrid, Barcelona, Valencia when relevant.' },
      'CL': { name: 'Chile', language: 'Spanish (Chilean)', regionalNotes: 'Use Chilean Spanish terminology. Include city references like Santiago, Valparaíso, Concepción when relevant.' },
      'PE': { name: 'Perú', language: 'Spanish (Peruvian)', regionalNotes: 'Use Peruvian Spanish terminology. Include city references like Lima, Arequipa, Trujillo when relevant.' },
      'US': { name: 'United States', language: 'Spanish (US Latino) or English', regionalNotes: 'For Spanish: Use neutral Latin American Spanish. For English: Use American English. Can reference major cities like Miami, Los Angeles, Houston, New York.' },
      'BR': { name: 'Brasil', language: 'Portuguese (Brazilian)', regionalNotes: 'Use Brazilian Portuguese terminology. Include city references like São Paulo, Rio de Janeiro, Brasília when relevant.' },
    };

    const context = countryContext[params.country] || {
      name: params.country,
      language: 'Local language',
      regionalNotes: 'Adapt terminology to local market.'
    };

    logger.info('ai', `[Gemini] Generating keywords for ${params.offerName} in ${context.name}`);

    const prompt = `You are an expert in SEO Strategy, PPC, and Growth Hacking, specialized in compliance policies and regional semantic adaptation with a focus on transactional and financial intent keywords.

PRIMARY MISSION:
Generate a list of exactly 10 high-conversion keywords, 100% compliant and culturally adapted, focused on the bottom of the funnel (BOFU). Keywords must be aggressive, commercial, and click-attractive, prioritizing purchase intent, hiring, or financial comparison.

CONTEXT:
- Target Country: ${context.name}
- Language: ${context.language}
- Regional Adaptation: ${context.regionalNotes}

WORKFLOW DIRECTIVES:

🔹 Step 0 - Linguistic and Cultural Adaptation (PRIORITY)
- Identify synonyms, regionalisms, and colloquial terms specific to ${context.name}.
- Replace generic words with more natural and commercial local equivalents.
- ${context.regionalNotes}

🔹 Step 1 - Competitor Analysis
- Consider 2-3 relevant competitors in ${context.name}.
- Think about what transactional and financial keywords they use in their communication.

🔹 Step 2 - List Generation (10 Keywords)
Focus: maximum conversion intent, direct and commercial language.

MANDATORY COMPOSITION:
- Minimum 3 Direct Transactional Keywords → include verbs like: buy, hire, finance, quote, invest, price, payment (in the target language)
- Minimum 2 Specific Action Long-Tails → start with verb + clear benefit + 6-10 words. Can include city/country name when relevant for conversion.
- Remaining 5 Keywords: combination of:
  * Commercial Research (vs, alternatives, best options)
  * Decision Questions (how much does it cost, how to finance)
  * Financial Angles (credit, leasing, investment, monthly payments)

COMPLIANCE AND QUALITY RULES (MANDATORY):
- Total Relevance: each keyword must be directly linked to the niche/offer.
- No deception or false superlatives: exclude "free", "cheapest", "top deals", "guaranteed", "100%", etc.
- No false interactivity: avoid "search here" or "click now".
- Location references: use real city/state/country names only if it adds to conversion value.
- Estimated search volume: >70 monthly.
- Temporality: only use 2025 or 2026 if intentional and relevant.

Generate 10 high-conversion BOFU keywords for this advertising campaign:

OFFER: ${params.offerName}
COPY MASTER (Main Message): ${params.copyMaster}
TARGET COUNTRY: ${context.name}
LANGUAGE: ${context.language}

REMEMBER:
- ${context.regionalNotes}
- Minimum 3 transactional keywords with action verbs
- Minimum 2 long-tail keywords (6-10 words) with specific benefits
- 5 mixed keywords (comparisons, questions, financial terms)
- Use real city/country names from ${context.name} when it adds value
- Perfect spelling in ${context.language}
- NO false claims, NO "free", NO "guaranteed"

CRITICAL OUTPUT FORMAT:
Return ONLY a valid JSON array with exactly 10 keywords. No markdown, no code blocks, no explanations, no numbering.
Example format: ["keyword 1", "keyword 2", "keyword 3", ...]`;

    try {
      const response = await this.geminiClient.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const cleanedResponse = this.cleanJsonResponse(text);
      let keywords = JSON.parse(cleanedResponse);

      // Ensure we always return exactly 10 keywords
      if (keywords.length > 10) {
        keywords = keywords.slice(0, 10);
      }

      if (!Array.isArray(keywords) || keywords.length === 0) {
        throw new Error('Gemini returned invalid keywords array');
      }

      logger.success('ai', `[Gemini] Generated ${keywords.length} keywords successfully`);

      // Save to database
      await this.saveAIContent({
        contentType: 'keywords',
        content: { keywords },
        model: 'gemini-2.0-flash',
        prompt: prompt,
      });

      return keywords;
    } catch (error: any) {
      logger.error('ai', `[Gemini] Keywords generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate Article content for RSOC campaigns
   * v2.8.0 - NOW USES GEMINI (no more Anthropic)
   */
  async generateArticle(params: GenerateArticleParams): Promise<{
    headline: string;
    teaser: string;
    contentGenerationPhrases: string[];
  }> {
    const model = 'gemini-2.0-flash';

    // Determine the base language from the language parameter
    const lang = params.language.toLowerCase();
    const { languageName, languageInstruction } = this.getLanguageInfo(lang, params.language);

    // Get dialect rule based on language and country
    const spanishDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms. Never use "vos" or Argentine forms.',
      'CO': 'Colombian Spanish: Use "tú/usted" forms. Formal and clear.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "soñás", "querés", "podés").',
      'ES': 'European Spanish: Use "tú/vosotros" forms.',
      'CL': 'Chilean Spanish: Use "tú" forms.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms.',
      'VE': 'Venezuelan Spanish: Use "tú/usted" forms.',
      'EC': 'Ecuadorian Spanish: Use "tú/usted" forms.',
    };

    const englishDialectRules: Record<string, string> = {
      'US': 'American English: Use US spelling.',
      'UK': 'British English: Use UK spelling.',
      'GB': 'British English: Use UK spelling.',
      'AU': 'Australian English: Use Australian conventions.',
      'CA': 'Canadian English: Mix of US/UK spelling.',
    };

    const portugueseDialectRules: Record<string, string> = {
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese.',
      'PT': 'European Portuguese: Use European Portuguese.',
    };

    let dialectRule = 'Use appropriate formal conventions for the target country.';
    const isEnglish = lang === 'en' || lang === 'english';
    const isPortuguese = lang === 'pt' || lang === 'portuguese';
    const isSpanish = lang === 'es' || lang === 'spanish';

    if (isEnglish) {
      dialectRule = englishDialectRules[params.country] || 'American English: Use US spelling.';
    } else if (isPortuguese) {
      dialectRule = portugueseDialectRules[params.country] || 'Brazilian Portuguese.';
    } else if (isSpanish) {
      dialectRule = spanishDialectRules[params.country] || 'Neutral Spanish: Use "tú/usted" forms.';
    }

    logger.info('ai', `[Gemini] Generating article in ${languageName} for country ${params.country}`);

    const prompt = `You are an expert content writer specialized in creating high-quality articles for native advertising that pass strict editorial review.

CRITICAL REQUIREMENTS (Article will be REJECTED if these are violated):

1. LANGUAGE & GRAMMAR:
   - ${languageInstruction}
   - Perfect spelling and grammar - zero tolerance for errors
   - ${dialectRule}
   - Use formal or semi-formal tone - NEVER informal/casual language
   - Match the EXACT dialect of the target country

2. FACTUAL ACCURACY:
   - NEVER invent statistics, numbers, or data
   - NEVER make exaggerated claims (e.g., "guaranteed", "100%", "always")
   - Use realistic, verifiable information only
   - If mentioning data, use general terms like "many people", "studies suggest" instead of fake percentages

3. CONTENT QUALITY:
   - Headlines must be compelling but truthful - no clickbait
   - Teaser must be informative and engaging (250-1000 characters)
   - Content generation phrases: EXACTLY 3-5 phrases (CRITICAL: Tonic will reject if less than 3 or more than 5)
   - Natural tone - not overly promotional or salesy

4. COMPLIANCE:
   - Appropriate for the offer type (loans, insurance, etc.)
   - No misleading statements
   - Professional and trustworthy tone

Create article content for this RSOC campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Keywords: ${params.keywords.join(', ')}
Country: ${params.country}
Language: ${params.language}

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ${dialectRule}

ALL CONTENT (headline, teaser, contentGenerationPhrases) MUST BE IN ${languageName.toUpperCase()}.

REMEMBER:
- Perfect grammar and spelling
- NO invented data or exaggerated claims
- Formal/semi-formal tone only
- Truthful, valuable content
- CRITICAL: contentGenerationPhrases must be EXACTLY 3, 4, or 5 phrases (NOT 2, NOT 6, NOT 7!)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "headline": "engaging headline in ${languageName} (max 256 characters)",
  "teaser": "compelling opening paragraph in ${languageName} (250-1000 characters)",
  "contentGenerationPhrases": ["phrase1 in ${languageName}", "phrase2", "phrase3", "phrase4"]
}`;

    try {
      const response = await this.geminiClient.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanedResponse = this.cleanJsonResponse(text);
      const article = JSON.parse(cleanedResponse);

      // CRITICAL VALIDATION: Tonic requires EXACTLY 3-5 content generation phrases
      if (!article.contentGenerationPhrases || !Array.isArray(article.contentGenerationPhrases)) {
        throw new Error('Gemini failed to generate contentGenerationPhrases array');
      }

      // If generated more than 5 phrases, trim to 5
      if (article.contentGenerationPhrases.length > 5) {
        logger.warn('ai', `[Gemini] Generated ${article.contentGenerationPhrases.length} phrases, trimming to 5 for Tonic compliance`);
        article.contentGenerationPhrases = article.contentGenerationPhrases.slice(0, 5);
      }

      // If generated less than 3 phrases, throw error
      if (article.contentGenerationPhrases.length < 3) {
        throw new Error(`Gemini generated only ${article.contentGenerationPhrases.length} content generation phrases, but Tonic requires 3-5`);
      }

      logger.success('ai', `[Gemini] Article generated successfully`);

      // Save to database
      await this.saveAIContent({
        contentType: 'article',
        content: article,
        model: 'gemini-2.0-flash',
        prompt: prompt,
      });

      return article;
    } catch (error: any) {
      logger.error('ai', `[Gemini] Article generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate Ad Copy for Meta/TikTok
   * v2.8.0 - NOW USES GEMINI (no more Anthropic)
   */
  async generateAdCopy(params: GenerateAdCopyParams): Promise<{
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
  }> {
    const model = 'gemini-2.0-flash';
    const lang = params.language.toLowerCase();

    const { languageName, languageInstruction } = this.getLanguageInfo(lang, params.language);

    logger.info('ai', `[Gemini] Generating ad copy in ${languageName} for ${params.platform}`);

    const platformGuidelines = {
      META: {
        primaryTextMax: 125,
        headlineMax: 40,
        descriptionMax: 30,
        ctas: [
          'LEARN_MORE',
          'SHOP_NOW',
          'SIGN_UP',
          'DOWNLOAD',
          'GET_QUOTE',
          'APPLY_NOW',
        ],
      },
      TIKTOK: {
        primaryTextMax: 100,
        headlineMax: 100,
        descriptionMax: 999,
        ctas: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW'],
      },
    };

    const guidelines = platformGuidelines[params.platform];

    const prompt = `You are an expert performance marketer creating ad copy for ${params.platform}.

Guidelines for ${params.platform}:
- Primary text: max ${guidelines.primaryTextMax} characters
- Headline: max ${guidelines.headlineMax} characters
- Description: max ${guidelines.descriptionMax} characters

CRITICAL REQUIREMENTS:
- ${languageInstruction}
- Perfect spelling and grammar (zero tolerance for errors)
- Formal or semi-formal tone (NO informal/casual language)
- NO exaggerated claims (e.g., "guaranteed", "100%", "never")
- NO invented statistics or fake data
- Attention-grabbing but truthful and realistic
- Conversion-focused but professional
- Clear, action-oriented language
- Complies with ${params.platform} advertising policies

Create ad copy for this campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Platform: ${params.platform}
Ad Format: ${params.adFormat}
Country: ${params.country}
Language: ${params.language}
${params.targetAudience ? `Target Audience: ${params.targetAudience}` : ''}

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ALL ad copy text MUST be in ${languageName}.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "primaryText": "main ad text in ${languageName}",
  "headline": "compelling headline in ${languageName}",
  "description": "description text in ${languageName}",
  "callToAction": "CTA text (one of: ${guidelines.ctas.join(', ')})"
}`;

    try {
      // 🔴 DIAGNOSTIC: Log before Gemini call
      console.log('\n🔴🔴🔴 [AI Service] ABOUT TO CALL GEMINI for generateAdCopy');
      console.log('🔴 Model:', model);
      console.log('🔴 GEMINI_API_KEY prefix:', process.env.GEMINI_API_KEY?.substring(0, 10));
      console.log('🔴 GOOGLE_AI_API_KEY prefix:', process.env.GOOGLE_AI_API_KEY?.substring(0, 10));
      console.log('🔴🔴🔴\n');

      const response = await this.geminiClient.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanedResponse = this.cleanJsonResponse(text);
      const adCopy = JSON.parse(cleanedResponse);

      if (!adCopy.primaryText || !adCopy.headline) {
        throw new Error('Gemini returned incomplete ad copy');
      }

      logger.success('ai', `[Gemini] Ad copy generated successfully for ${params.platform}`);

      // Save to database
      await this.saveAIContent({
        contentType: 'ad_copy',
        content: adCopy,
        model: 'gemini-2.0-flash',
        prompt: prompt,
      });

      return adCopy;
    } catch (error: any) {
      // 🔴 DIAGNOSTIC: Full error details
      console.log('\n🔴🔴🔴 [AI Service] GEMINI CALL FAILED - FULL ERROR DIAGNOSTIC');
      console.log('🔴 Error name:', error.name);
      console.log('🔴 Error message:', error.message);
      console.log('🔴 Error code:', error.code);
      console.log('🔴 Is Axios error:', error.isAxiosError);
      console.log('🔴 Response status:', error.response?.status);
      console.log('🔴 Response data:', JSON.stringify(error.response?.data || {}).substring(0, 500));
      console.log('🔴 Request URL:', error.config?.url);
      console.log('🔴 Contains "x-api-key":', error.message?.includes('x-api-key'));
      console.log('🔴 Contains "anthropic":', error.message?.includes('anthropic'));
      console.log('🔴 Contains "req_":', error.message?.includes('req_'));
      console.log('🔴🔴🔴\n');

      logger.error('ai', `[Gemini] Ad copy generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate 5 Copy Master suggestions - short, high-converting ad titles
   */
  async generateCopyMasterSuggestions(params: {
    offerName: string;
    offerDescription?: string;
    vertical?: string;
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<string[]> {
    const systemPrompt = `Actúa como un experto en Copywriting para Anuncios de Alto Rendimiento (PPC y Social Ads).
Tu objetivo es generar 5 opciones de títulos cortos (máximo 50-80 caracteres incluyendo espacios) que generen curiosidad inmediata y clics.

TUS INSTRUCCIONES:
1. **Analiza las variables:** País, Idioma y Categoría.
2. **Localización:** Usa terminología específica del país (ej: "Enganche" en México, "Pie" en Chile, "Inicial" en Perú).
3. **El Gancho ("Picante"):** El copy debe atacar un dolor, una objeción común (ej: "a credito", "cuotas"). No seas genérico.
4. **La Fórmula:** [Beneficio/Gancho corto] + [Sufijo Obligatorio].
5. **Sufijos Obligatorios:** Debes terminar CADA opción con una de estas frases (o variaciones cortas): "Lo que debes saber", "Infórmate más", "Aprende más", "Ver detalles".
6. **Formato:** Usa emojis estratégicos al inicio para llamar la atención en algunas opciones.
7. No uses ninguno de los siguientes términos: gratis, barato, empleo, trabajo, economico, facil, rapido.`;

    const userPrompt = `VARIABLES:
- PAIS: ${params.country}
- IDIOMA: ${params.language}
- CATEGORIA: ${params.offerName}
${params.vertical ? `- VERTICAL: ${params.vertical}` : ''}

Responde SOLO con un JSON array de exactamente 5 strings (cada uno 50-80 caracteres), sin explicaciones ni markdown:
["copy1", "copy2", "copy3", "copy4", "copy5"]`;

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    let suggestions: string[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 5 suggestions
    if (suggestions.length > 5) {
      suggestions = suggestions.slice(0, 5);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'copy_master_suggestions',
      content: { suggestions },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    return suggestions;
  }

  /**
   * Generate 10 keyword suggestions following SEO Senior Specialist methodology
   * Distribution: 5 financial, 1 geographic, 2 need, 2 urgency
   */
  async generateKeywordsSuggestions(params: {
    category: string;
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<{ keyword: string; type: string }[]> {
    const systemPrompt = `Actúa como un especialista Senior en SEO y Keyword Research. Tu tarea es generar una lista de 10 palabras clave (keywords) transaccionales y de navegación para la categoría especificada. Las keywords deben simular consultas orgánicas y naturales que los usuarios escriben en la barra de búsqueda de Google.

Debes seguir estrictamente la siguiente distribución para las 10 opciones:

1. (5 Keywords) Foco Financiero: Deben incluir términos relacionados con facilidades de pago, crédito o historial crediticio (ejemplos: "reportados en datacrédito", "pagar a cuotas", "sin cuota inicial", "crédito fácil").

2. (1 Keyword) Foco Geográfico: Debe incluir explícitamente el nombre de la ciudad más importante del país especificado dentro de la frase de búsqueda.

3. (2 Keywords) Foco en Necesidad: Deben abordar un problema, dolor o requerimiento específico que el usuario necesita solucionar con esta categoría.

4. (2 Keywords) Foco en Urgencia: Deben contener gatillos de tiempo que indiquen inmediatez (ejemplos: "para hoy", "entrega inmediata", "rápido", "urgente").

IMPORTANTE:
- Determina automáticamente la ciudad más importante del país (ej: Bogotá para Colombia, Ciudad de México para México, Lima para Perú, Madrid para España, etc.).
- Las keywords deben estar en el idioma especificado.
- Deben ser búsquedas realistas que un usuario haría en Google.`;

    const userPrompt = `Genera exactamente 10 keywords para:

Categoría: ${params.category}
País: ${params.country}
Idioma: ${params.language}

Responde SOLO con un JSON array de objetos con esta estructura exacta, sin explicaciones ni markdown:
[
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "geographic"},
  {"keyword": "keyword aquí", "type": "need"},
  {"keyword": "keyword aquí", "type": "need"},
  {"keyword": "keyword aquí", "type": "urgency"},
  {"keyword": "keyword aquí", "type": "urgency"}
]`;

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    let suggestions: { keyword: string; type: string }[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 10 suggestions
    if (suggestions.length > 10) {
      suggestions = suggestions.slice(0, 10);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'keyword_suggestions',
      content: { suggestions },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    return suggestions;
  }

  /**
   * Generate 5 Ad Title (Headline) suggestions - max 80 chars
   * Step 1 of the sequential Ad Copy generation flow
   */
  async generateAdTitleSuggestions(params: {
    offerName: string;
    copyMaster: string;
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<string[]> {
    const systemPrompt = `Actúa como experto en Copywriting para Anuncios. Genera 5 opciones de TÍTULOS que generen alta curiosidad.

RESTRICCIONES TÉCNICAS:
1. Longitud: Máximo 80 caracteres (incluyendo espacios).
2. Palabras PROHIBIDAS (Estricto): gratis, barato, empleo, trabajo, economico, facil, rapido.

INSTRUCCIONES DE CONTENIDO:
1. Analiza: PAIS, IDIOMA, CATEGORIA.
2. Localización: Usa jerga local del país para términos financieros (ej: "Pie" en CL, "Inicial" en PE, "Enganche" en MX).
3. El Gancho ("Picante"): Ataca una objeción financiera o dolor (ej: "a crédito", "sin historial", "cuotas").
4. Formato: Usa emojis al inicio para destacar.`;

    const userPrompt = `VARIABLES:
- PAIS: ${params.country}
- IDIOMA: ${params.language}
- CATEGORIA: ${params.offerName}
- Copy Master: ${params.copyMaster}

Responde SOLO con un JSON array de exactamente 5 strings (cada uno máximo 80 caracteres), sin explicaciones ni markdown:
["titulo1", "titulo2", "titulo3", "titulo4", "titulo5"]`;

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    let suggestions: string[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 5 suggestions
    if (suggestions.length > 5) {
      suggestions = suggestions.slice(0, 5);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'ad_title_suggestions',
      content: { suggestions },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    return suggestions;
  }

  /**
   * Generate 5 Ad Primary Text suggestions - max 120 chars
   * Step 2 of the sequential Ad Copy generation flow (requires selected title)
   */
  async generateAdPrimaryTextSuggestions(params: {
    offerName: string;
    copyMaster: string;
    selectedTitle: string;
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<string[]> {
    const systemPrompt = `Actúa como experto en Copywriting. Genera 5 opciones de TEXTO PRINCIPAL (Primary Text) persuasivo.

RESTRICCIONES TÉCNICAS:
1. Longitud: Máximo 120 caracteres (incluyendo espacios).
2. Palabras PROHIBIDAS (Estricto): gratis, barato, empleo, trabajo, economico, facil, rapido.

INSTRUCCIONES DE CONTENIDO:
1. Analiza: PAIS, IDIOMA, CATEGORIA.
2. Localización: Usa terminología local exacta del país indicado.
3. El Gancho ("Picante"): Plantea una pregunta retórica sobre financiación o un dato revelador que ataque la incertidumbre del usuario.
4. La Fórmula: [Pregunta/Situación de dolor] + [Sufijo Obligatorio].
5. Sufijos Obligatorios: Integra al final: "Lo que debes saber", "Infórmate más", "Aprende más" o "Ver detalles".
6. Formato: Usa emojis estratégicos.`;

    const userPrompt = `VARIABLES:
- PAIS: ${params.country}
- IDIOMA: ${params.language}
- CATEGORIA: ${params.offerName}
- Copy Master: ${params.copyMaster}
- Ad Title seleccionado: ${params.selectedTitle}

Responde SOLO con un JSON array de exactamente 5 strings (cada uno máximo 120 caracteres), sin explicaciones ni markdown:
["texto1", "texto2", "texto3", "texto4", "texto5"]`;

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    let suggestions: string[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 5 suggestions
    if (suggestions.length > 5) {
      suggestions = suggestions.slice(0, 5);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'ad_primary_text_suggestions',
      content: { suggestions, selectedTitle: params.selectedTitle },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    return suggestions;
  }

  /**
   * Generate 5 Ad Description suggestions - max 120 chars
   * Step 3 of the sequential Ad Copy generation flow (requires selected title and primary text)
   */
  async generateAdDescriptionSuggestions(params: {
    offerName: string;
    copyMaster: string;
    selectedTitle: string;
    selectedPrimaryText: string;
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<string[]> {
    const systemPrompt = `Actúa como experto en Copywriting. Genera 5 opciones de DESCRIPCIONES (para la parte inferior del anuncio).

RESTRICCIONES TÉCNICAS:
1. Longitud: Máximo 120 caracteres (incluyendo espacios).
2. Palabras PROHIBIDAS (Estricto): gratis, barato, empleo, trabajo, economico, facil, rapido.

INSTRUCCIONES DE CONTENIDO:
1. Analiza: PAIS, IDIOMA, CATEGORIA, Copy master, Ad Title y Ad Primary Text.
2. Localización: Adapta los términos de pago al país (ej: cuotas, plazos, letras).
3. Detalla la información con un enfoque informativo que complemente el título y texto principal.`;

    const userPrompt = `VARIABLES:
- PAIS: ${params.country}
- IDIOMA: ${params.language}
- CATEGORIA: ${params.offerName}
- Copy Master: ${params.copyMaster}
- Ad Title: ${params.selectedTitle}
- Ad Primary Text: ${params.selectedPrimaryText}

Responde SOLO con un JSON array de exactamente 5 strings (cada uno máximo 120 caracteres), sin explicaciones ni markdown:
["desc1", "desc2", "desc3", "desc4", "desc5"]`;

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    let suggestions: string[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 5 suggestions
    if (suggestions.length > 5) {
      suggestions = suggestions.slice(0, 5);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'ad_description_suggestions',
      content: {
        suggestions,
        selectedTitle: params.selectedTitle,
        selectedPrimaryText: params.selectedPrimaryText
      },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    return suggestions;
  }

  /**
   * Generate Ad Copy suggestions for Meta and TikTok ads
   * Uses RSOC-compliant CopyBot 8.0 prompt with 10 psychological angles
   * Meta: headline (80 chars max), primaryText (120 chars max), description (30 chars)
   * TikTok: adText (100 chars)
   */
  async generateAdCopySuggestions(params: {
    offerName: string;
    copyMaster: string;
    platform: 'META' | 'TIKTOK';
    country: string;
    language: string;
    apiKey?: string;
  }): Promise<{
    meta?: { headline: string; primaryText: string; description: string }[];
    tiktok?: { adText: string }[];
  }> {
    const platformName = params.platform === 'META' ? 'Meta Ads (Facebook/Instagram)' : 'TikTok Ads';

    const systemPrompt = `You are "CopyBot 8.0", an elite RSOC ad copywriter specialized in ${platformName} for Search Arbitrage campaigns.

# CORE IDENTITY & SAFETY

## The Search Interface Rule (CRITICAL)
Every ad must feel like a gateway to helpful information—NOT a sales pitch. Users should feel they're about to discover something useful, not be sold something.

## Mission
Create ad copies that generate genuine curiosity while maintaining strict RSOC compliance. Your copies must pass Google AdSense policies and drive high-intent clicks from users genuinely interested in learning.

# BLACKLIST - NEVER USE THESE

## Forbidden Words & Phrases (Auto-Reject)
### Employment Terms
- "job", "empleo", "trabajo", "hiring", "vacancy", "position"

### Price/Free Claims
- "free", "gratis", "discount", "offer", "deal", "cheap", "save"

### Health Claims
- "cure", "cura", "prevent", "heal", "treatment", "remedy"

### Aggressive Finance
- "guaranteed", "garantizado", "loan", "préstamo", "immediate", "inmediato"

### Clickbait CTAs
- "click here", "haz clic", "buy now", "compra", "see price", "ver precio", "last chance", "última hora", "claim now", "reclama"

### Comparison Terms
- "compare", "comparar", "before and after", "antes y después", "vs", "versus"

### Location Terms
- "near me", "cerca de mí", "in your area", "en tu zona", "nearby", "local"

### Alternative Terms
- "alternatives", "alternativas", "options", "opciones"

# SUCCESS PATTERNS

## Visual Style Patterns (Reference)
- Clean informational layouts with subtle urgency cues
- Professional color schemes (blues, greens for trust)
- Simple iconography supporting the educational angle
- Newspaper/article-style formatting when appropriate

## Structural Diversity
Each set of copies should vary between:
- Question-led (creates curiosity gap)
- Statement-led (authoritative information)
- News-style (current relevance)
- Educational angle (learn/discover framing)

## Conversion Hooks (Approved)
- Curiosity gaps: "What [demographic] should know about..."
- Timely relevance: "New [year] information about..."
- Knowledge promise: "Understanding [topic]..."
- Discovery framing: "How [topic] is changing..."

## Mandatory Educational CTAs
Use ONLY these call-to-action styles:
- "Learn how..." / "Aprende cómo..."
- "What you should know about..." / "Lo que debería saber de..."
- "Discover how..." / "Descubre cómo..."
- "Learn More" / "Más información"
- "Read More" / "Leer más"
- "See Details" / "Ver detalles"

# PLATFORM CONSTRAINTS

## Meta Ads (Facebook/Instagram)
- Primary Text: Maximum 120 characters (STRICT)
- Headline: Maximum 80 characters (STRICT)
- Description: Maximum 30 characters

## TikTok Ads
- Ad Text: Maximum 100 characters (STRICT)

## Taboola (Native)
- Headline: Maximum 100 characters (STRICT)

# THE 10 PSYCHOLOGICAL ANGLES

Generate copies using these angles (vary which ones you use):

## 1. Financial Angle 1 - Cost Awareness
Frame: "[Demographic] discover [topic] costs for [year]"
Example: "Seniors reviewing Medicare supplement rates for 2025"

## 2. Financial Angle 2 - Savings Discovery
Frame: "Understanding potential savings on [topic]"
Example: "How homeowners are learning about energy costs"

## 3. Financial Angle 3 - Program Discovery
Frame: "New programs [demographic] are exploring in [year]"
Example: "Assistance programs veterans are discovering in 2025"

## 4. Necessity Angle
Frame: "Why [demographic] are researching [essential topic]"
Example: "Why families are learning about insurance requirements"

## 5. Soft Urgency Angle
Frame: "[Year] updates affecting [topic] decisions"
Example: "2025 changes in home warranty coverage explained"

## 6. Opportunity Awareness Angle
Frame: "Information [demographic] wish they'd found sooner"
Example: "What retirees are learning about benefit options"

## 7. Curiosity/Discovery Angle
Frame: "What's changing about [topic] in [year]"
Example: "How car insurance options are evolving in 2025"

## 8. Qualifier/Eligibility Angle
Frame: "See if you might qualify for [benefit type]"
Example: "Understanding walk-in tub program eligibility"

## 9. Market Update Angle
Frame: "Latest information on [topic] for [demographic]"
Example: "Current auto insurance landscape for drivers"

## 10. Mistake Avoidance Angle
Frame: "Common [topic] oversights to understand"
Example: "Medicare enrollment considerations many miss"

# CULTURAL RELEVANCE
Content must be culturally appropriate and relevant for ${params.country}. Use local expressions, references, and cultural context that resonates with the target audience.

# OUTPUT LANGUAGE
All ad copies must be written in ${params.language}.`;

    let userPrompt: string;

    if (params.platform === 'META') {
      userPrompt = `Generate exactly 5 Meta Ad copy combinations for:

OFFER: ${params.offerName}
COPY MASTER (reference text): ${params.copyMaster}
COUNTRY: ${params.country}
LANGUAGE: ${params.language}

Requirements:
- Use different psychological angles from the 10 available (vary them)
- Each copy must pass RSOC compliance
- NO blacklisted words or phrases
- Culturally relevant for ${params.country}
- Written in ${params.language}

Character limits (STRICT - do not exceed):
- primaryText: Maximum 120 characters
- headline: Maximum 80 characters
- description: Maximum 30 characters

Output ONLY a valid JSON array with no markdown, no explanations:
[
  {"headline": "text here", "primaryText": "text here", "description": "text here"},
  {"headline": "text here", "primaryText": "text here", "description": "text here"},
  {"headline": "text here", "primaryText": "text here", "description": "text here"},
  {"headline": "text here", "primaryText": "text here", "description": "text here"},
  {"headline": "text here", "primaryText": "text here", "description": "text here"}
]`;
    } else {
      userPrompt = `Generate exactly 5 TikTok Ad texts for:

OFFER: ${params.offerName}
COPY MASTER (reference text): ${params.copyMaster}
COUNTRY: ${params.country}
LANGUAGE: ${params.language}

Requirements:
- Use different psychological angles from the 10 available (vary them)
- Each copy must pass RSOC compliance
- NO blacklisted words or phrases
- Casual, direct tone appropriate for TikTok
- Culturally relevant for ${params.country}
- Written in ${params.language}

Character limit (STRICT - do not exceed):
- adText: Maximum 100 characters

Output ONLY a valid JSON array with no markdown, no explanations:
[
  {"adText": "text here"},
  {"adText": "text here"},
  {"adText": "text here"},
  {"adText": "text here"},
  {"adText": "text here"}
]`;
    }

    const model = 'gemini-2.0-flash';
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.geminiClient.models.generateContent({
      model,
      contents: prompt,
    });

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'ad_copy_suggestions',
      content: { platform: params.platform, suggestions: cleanedResponse },
      model: 'gemini-2.0-flash',
      prompt: userPrompt,
    });

    if (params.platform === 'META') {
      let suggestions: { headline: string; primaryText: string; description: string }[] = JSON.parse(cleanedResponse);
      if (suggestions.length > 5) {
        suggestions = suggestions.slice(0, 5);
      }
      return { meta: suggestions };
    } else {
      let suggestions: { adText: string }[] = JSON.parse(cleanedResponse);
      if (suggestions.length > 5) {
        suggestions = suggestions.slice(0, 5);
      }
      return { tiktok: suggestions };
    }
  }

  /**
   * Generate targeting suggestions based on offer and copy
   */
  async generateTargetingSuggestions(params: {
    offerName: string;
    copyMaster: string;
    platform: 'META' | 'TIKTOK';
    apiKey?: string;
  }): Promise<{
    ageGroups: string[];
    interests: string[];
    behaviors?: string[];
    demographics: string;
  }> {
    // v2.8.0 - NOW USES GEMINI (no more Anthropic)
    const model = 'gemini-2.0-flash';

    logger.info('ai', `[Gemini] Generating targeting suggestions for ${params.platform}`);

    const prompt = `You are an expert media buyer specialized in ${params.platform} Ads targeting.

Analyze the offer and copy master to suggest optimal targeting parameters. Be specific and data-driven.

Suggest targeting for this campaign on ${params.platform}:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "ageGroups": ["age ranges that match the offer"],
  "interests": ["specific interest categories"],
  "behaviors": ["behavioral targeting categories (Meta only)"],
  "demographics": "detailed description of ideal audience"
}`;

    try {
      const response = await this.geminiClient.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanedResponse = this.cleanJsonResponse(text);
      const suggestions = JSON.parse(cleanedResponse);

      logger.success('ai', `[Gemini] Targeting suggestions generated for ${params.platform}`);

      return suggestions;
    } catch (error: any) {
      logger.error('ai', `[Gemini] Targeting suggestions generation failed: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // IMAGE GENERATION (Google Gemini - Nano Banana Pro)
  // ============================================

  /**
   * Generate image using Google Gemini (Nano Banana Pro)
   * Uses gemini-2.0-flash for high-quality image generation with excellent text rendering
   */
  async generateImage(params: GenerateImageParams): Promise<{
    imageUrl: string;
    gcsPath: string;
  }> {
    const model = 'gemini-2.0-flash'; // Nano Banana Pro model

    logger.info('ai', `Generating image with Gemini ${model}...`);

    try {
      // Use Gemini API for image generation
      const response = await this.geminiClient.models.generateContent({
        model,
        contents: params.prompt,
        config: {
          responseModalities: ['image', 'text'],
        },
      });

      // Extract image data from response
      let imageBase64: string | undefined;
      let mimeType = 'image/png';

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'image/png';
            break;
          }
        }
      }

      if (!imageBase64) {
        throw new Error('No image generated from Gemini API');
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      // Determine file extension based on mime type
      const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

      // Upload to Google Cloud Storage
      const fileName = `generated-images/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
      const bucket = this.storage.bucket(env.GCP_STORAGE_BUCKET);
      const file = bucket.file(fileName);

      await file.save(imageBuffer, {
        contentType: mimeType,
        metadata: {
          metadata: {
            prompt: params.prompt,
            model: model,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      // Generate signed URL (valid for 7 days)
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      logger.success('ai', `Image generated successfully with Gemini ${model}`);

      return {
        imageUrl: signedUrl,
        gcsPath: fileName,
      };
    } catch (error: any) {
      logger.error('ai', `Gemini image generation failed: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // VIDEO GENERATION (Vertex AI - Veo 3.1 Fast)
  // ============================================

  /**
   * Generate video using Vertex AI Veo 3.1 Fast
   */
  async generateVideo(params: GenerateVideoParams): Promise<{
    videoUrl: string;
    gcsPath: string;
  }> {
    const project = env.GCP_PROJECT_ID;
    const location = env.GCP_LOCATION;
    const model = 'veo-3.1-fast'; // Or 'veo-3.0-generate-001'

    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${model}`;

    const instanceValue = helpers.toValue({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds || 5,
      aspectRatio: params.aspectRatio || '16:9',
      ...(params.fromImageUrl && { imageUrl: params.fromImageUrl }),
    });

    const instances = [instanceValue];
    const request = {
      endpoint,
      instances,
    };

    const [response] = await this.vertexAiClient.predict(request);

    // Get generated video (base64 or GCS path)
    const predictions = response.predictions;
    const videoBase64 = predictions[0].structValue?.fields?.bytesBase64Encoded?.stringValue;

    if (!videoBase64) {
      throw new Error('No video generated from Vertex AI');
    }

    // Convert base64 to buffer
    const videoBuffer = Buffer.from(videoBase64, 'base64');

    // Upload to Google Cloud Storage
    const fileName = `generated-videos/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    const bucket = this.storage.bucket(env.GCP_STORAGE_BUCKET);
    const file = bucket.file(fileName);

    await file.save(videoBuffer, {
      contentType: 'video/mp4',
      metadata: {
        metadata: {
          prompt: params.prompt,
          model: model,
          durationSeconds: params.durationSeconds || 5,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Generate signed URL (valid for 7 days) instead of makePublic()
    // This works with Uniform Bucket-Level Access enabled
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const videoUrl = signedUrl;

    return {
      videoUrl,
      gcsPath: fileName,
    };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  // ============================================
  // UGC MEDIA GENERATION (Full workflow)
  // ============================================

  /**
   * Generate UGC-style media for campaigns
   * Handles images, videos, and video thumbnails based on platform requirements
   */
  async generateUGCMedia(params: {
    campaignId: string;
    platform: 'META' | 'TIKTOK';
    mediaType: 'IMAGE' | 'VIDEO' | 'BOTH';
    count: number;
    category: string;      // Offer vertical/category (e.g., "Autos usados")
    country: string;       // Country code (e.g., "CO", "MX")
    language: string;      // Language code (e.g., "es", "en")
    adTitle: string;       // Ad headline for text overlay
    copyMaster: string;    // Copy master for video text overlay
    offerName?: string;    // Specific offer name for better context
    vertical?: string;     // Vertical from Tonic for classification
    apiKey?: string;
  }): Promise<{
    images: { url: string; gcsPath: string; prompt: string }[];
    videos: { url: string; gcsPath: string; prompt: string; thumbnailUrl?: string; thumbnailGcsPath?: string }[];
  }> {
    const results: {
      images: { url: string; gcsPath: string; prompt: string }[];
      videos: { url: string; gcsPath: string; prompt: string; thumbnailUrl?: string; thumbnailGcsPath?: string }[];
    } = {
      images: [],
      videos: [],
    };

    // Build UGC params with new vertical classification data
    const ugcParams: UGCPromptParams = {
      category: params.category,
      country: params.country,
      language: params.language,
      adTitle: params.adTitle,
      copyMaster: params.copyMaster,
      offerName: params.offerName,
      vertical: params.vertical,
    };

    // Log the vertical classification for debugging
    const verticalKey = classifyVertical(
      params.offerName || params.category,
      params.category,
      params.vertical
    );
    logger.info('ai', `🎯 Vertical classified as: ${verticalKey} (offer: ${params.offerName || 'N/A'}, category: ${params.category}, vertical: ${params.vertical || 'N/A'})`);

    // DEBUG: Log para verificar el count recibido
    logger.info('ai', `📊 DEBUG: generateUGCMedia called with count=${params.count}, platform=${params.platform}, mediaType=${params.mediaType}`);

    // Determine what to generate based on platform and mediaType
    const shouldGenerateImages = params.platform === 'META' &&
      (params.mediaType === 'IMAGE' || params.mediaType === 'BOTH');
    const shouldGenerateVideos = params.mediaType === 'VIDEO' || params.mediaType === 'BOTH';

    // TikTok only allows videos
    if (params.platform === 'TIKTOK' && params.mediaType === 'IMAGE') {
      logger.warn('ai', 'TikTok does not allow image-only ads. Switching to VIDEO.');
    }

    // Generate images (only for Meta)
    if (shouldGenerateImages) {
      logger.info('ai', `Generating ${params.count} UGC image(s) for ${params.platform}...`);

      for (let i = 0; i < params.count; i++) {
        try {
          const imagePrompt = buildUGCImagePrompt(ugcParams);
          logger.info('ai', `Generating image ${i + 1}/${params.count}...`);

          const image = await this.generateImage({
            prompt: imagePrompt,
            aspectRatio: '1:1', // Square for Meta feed
          });

          results.images.push({
            url: image.imageUrl,
            gcsPath: image.gcsPath,
            prompt: imagePrompt,
          });

          logger.success('ai', `Image ${i + 1}/${params.count} generated successfully`);
        } catch (error: any) {
          logger.error('ai', `Failed to generate image ${i + 1}: ${error.message}`);
          throw error;
        }
      }
    }

    // Generate videos
    if (shouldGenerateVideos || params.platform === 'TIKTOK') {
      const videoCount = params.platform === 'TIKTOK' || !shouldGenerateImages ? params.count : params.count;
      logger.info('ai', `Generating ${videoCount} UGC video(s) for ${params.platform}...`);

      for (let i = 0; i < videoCount; i++) {
        try {
          const videoPrompt = buildUGCVideoPrompt(ugcParams);
          logger.info('ai', `Generating video ${i + 1}/${videoCount}...`);

          const video = await this.generateVideo({
            prompt: videoPrompt,
            aspectRatio: '9:16', // Vertical for both TikTok and Meta Reels
            durationSeconds: 5,  // Short form content
          });

          const videoResult: {
            url: string;
            gcsPath: string;
            prompt: string;
            thumbnailUrl?: string;
            thumbnailGcsPath?: string;
          } = {
            url: video.videoUrl,
            gcsPath: video.gcsPath,
            prompt: videoPrompt,
          };

          // Meta requires a thumbnail for video ads
          if (params.platform === 'META') {
            logger.info('ai', `Generating thumbnail for video ${i + 1}...`);

            const thumbnailPrompt = buildVideoThumbnailPrompt(ugcParams);
            const thumbnail = await this.generateImage({
              prompt: thumbnailPrompt,
              aspectRatio: '9:16', // Match video aspect ratio
            });

            videoResult.thumbnailUrl = thumbnail.imageUrl;
            videoResult.thumbnailGcsPath = thumbnail.gcsPath;
            logger.success('ai', `Thumbnail generated for video ${i + 1}`);
          }

          results.videos.push(videoResult);
          logger.success('ai', `Video ${i + 1}/${videoCount} generated successfully`);
        } catch (error: any) {
          logger.error('ai', `Failed to generate video ${i + 1}: ${error.message}`);
          throw error;
        }
      }
    }

    logger.success('ai', `UGC media generation complete: ${results.images.length} images, ${results.videos.length} videos`);
    return results;
  }

  /**
   * Clean JSON response from Claude (removes markdown code blocks)
   */
  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    let cleaned = text.trim();

    // Remove opening code block
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');

    // Remove closing code block
    cleaned = cleaned.replace(/\n?```\s*$/, '');

    return cleaned.trim();
  }

  /**
   * Save AI-generated content to database
   */
  private async saveAIContent(data: {
    campaignId?: string;
    contentType: string;
    content: any;
    model: string;
    prompt: string;
    tokensUsed?: number;
  }) {
    if (!data.campaignId) {
      // If no campaign ID, skip saving (used during testing)
      return;
    }

    await prisma.aIContent.create({
      data: {
        campaignId: data.campaignId,
        contentType: data.contentType,
        content: data.content,
        model: data.model,
        prompt: data.prompt,
        tokensUsed: data.tokensUsed,
      },
    });
  }

  /**
   * Generate a single image for preview in the campaign wizard
   * Uses UGC-style prompts for authentic-looking images
   */
  async generateImageForPreview(params: {
    category: string;
    country: string;
    language: string;
    adTitle: string;
    copyMaster: string;
  }): Promise<{ url: string; gcsPath: string; prompt: string }> {
    const ugcParams: UGCPromptParams = {
      category: params.category,
      country: params.country,
      language: params.language,
      adTitle: params.adTitle,
      copyMaster: params.copyMaster,
    };

    const prompt = buildUGCImagePrompt(ugcParams);

    logger.info('ai', 'Generating preview image with Vertex AI Imagen');

    const result = await this.generateImage({
      prompt,
      aspectRatio: '1:1', // Square for Meta feed
    });

    return {
      url: result.imageUrl,
      gcsPath: result.gcsPath,
      prompt,
    };
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
