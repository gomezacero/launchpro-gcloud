import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Replicate the vertical templates and functions from ai.service.ts for prompt preview
// This allows us to preview prompts without actually generating media

interface UGCPromptParams {
  category: string;
  country: string;
  language: string;
  adTitle: string;
  copyMaster: string;
  offerName?: string;
  vertical?: string;
}

interface VerticalTemplate {
  name: string;
  keywords: string[];
  visualStyle: {
    subjects: string[];
    settings: string[];
    props: string[];
    mood: string;
    colors: string[];
    lighting: string;
  };
  adStyle: {
    tone: string;
    callToAction: string;
  };
}

const COUNTRY_NAMES: Record<string, string> = {
  'MX': 'Mexico',
  'CO': 'Colombia',
  'AR': 'Argentina',
  'ES': 'Espana',
  'CL': 'Chile',
  'PE': 'Peru',
  'VE': 'Venezuela',
  'EC': 'Ecuador',
  'US': 'Estados Unidos',
  'BR': 'Brasil',
  'PT': 'Portugal',
  'UK': 'Reino Unido',
  'GB': 'Reino Unido',
};

const LANGUAGE_NAMES: Record<string, string> = {
  'es': 'espanol',
  'spanish': 'espanol',
  'en': 'ingles',
  'english': 'ingles',
  'pt': 'portugues',
  'portuguese': 'portugues',
};

const VERTICAL_TEMPLATES: Record<string, VerticalTemplate> = {
  'finance_loans': {
    name: 'Prestamos / Loans',
    keywords: ['loan', 'prestamo', 'credito', 'credit', 'lending', 'borrow', 'dinero rapido', 'quick cash', 'personal loan'],
    visualStyle: {
      subjects: ['persona sonriendo con dinero en mano', 'familia feliz en casa nueva', 'persona usando celular para transferencia'],
      settings: ['sala de casa modesta pero acogedora', 'oficina de banco', 'exterior de casa'],
      props: ['billetes de moneda local', 'celular mostrando app bancaria', 'documentos de aprobacion', 'llaves de casa'],
      mood: 'esperanzador, alivio financiero, confianza',
      colors: ['verde dinero', 'azul confianza', 'blanco limpio'],
      lighting: 'iluminacion calida natural, sensacion de hogar'
    },
    adStyle: {
      tone: 'confiable y accesible',
      callToAction: 'Solicita ahora, Aprobacion rapida'
    }
  },
  'finance_insurance': {
    name: 'Seguros / Insurance',
    keywords: ['insurance', 'seguro', 'cobertura', 'coverage', 'proteccion', 'protection', 'poliza', 'policy'],
    visualStyle: {
      subjects: ['familia protegida bajo techo', 'persona mayor tranquila', 'auto protegido'],
      settings: ['hogar seguro', 'hospital', 'carretera'],
      props: ['paraguas protector', 'escudo', 'documentos de poliza', 'auto'],
      mood: 'seguridad, tranquilidad, proteccion familiar',
      colors: ['azul seguridad', 'verde estabilidad', 'blanco pureza'],
      lighting: 'luz suave y reconfortante'
    },
    adStyle: {
      tone: 'protector y tranquilizador',
      callToAction: 'Protege a tu familia, Cotiza gratis'
    }
  },
  'finance_cards': {
    name: 'Tarjetas de Credito / Credit Cards',
    keywords: ['credit card', 'tarjeta de credito', 'tarjeta', 'card', 'rewards', 'cashback', 'puntos'],
    visualStyle: {
      subjects: ['persona haciendo compra con tarjeta', 'joven viajando', 'persona en tienda'],
      settings: ['centro comercial', 'aeropuerto', 'restaurante elegante', 'tienda online'],
      props: ['tarjeta de credito brillante', 'bolsas de compras', 'pasaporte', 'celular con app'],
      mood: 'libertad financiera, estilo de vida aspiracional',
      colors: ['dorado premium', 'negro elegante', 'plateado'],
      lighting: 'iluminacion premium, brillos en la tarjeta'
    },
    adStyle: {
      tone: 'aspiracional pero alcanzable',
      callToAction: 'Solicita tu tarjeta, Beneficios exclusivos'
    }
  },
  'auto_used': {
    name: 'Autos Usados / Used Cars',
    keywords: ['used car', 'auto usado', 'carro usado', 'seminuevo', 'second hand', 'pre-owned', 'vehiculo'],
    visualStyle: {
      subjects: ['persona inspeccionando auto', 'familia junto a auto', 'vendedor mostrando auto'],
      settings: ['lote de autos', 'estacionamiento', 'calle residencial', 'concesionaria'],
      props: ['auto sedan o SUV popular', 'llaves de auto', 'documentos de venta', 'cartel de precio'],
      mood: 'oportunidad, buen negocio, emocion de compra',
      colors: ['rojo auto', 'azul metalico', 'blanco', 'plateado'],
      lighting: 'luz de dia exterior, el auto debe verse brillante'
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
      settings: ['aeropuerto', 'mostrador de renta', 'carretera escenica', 'ciudad turistica'],
      props: ['auto moderno', 'maletas', 'mapa o GPS', 'llaves'],
      mood: 'aventura, libertad, viaje',
      colors: ['azul cielo', 'amarillo sol', 'verde naturaleza'],
      lighting: 'luz brillante de dia, sensacion de vacaciones'
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
      subjects: ['mecanico trabajando', 'persona instalando pieza', 'dueno de auto orgulloso'],
      settings: ['taller mecanico', 'garage casero', 'tienda de autopartes'],
      props: ['piezas de auto', 'herramientas', 'motor', 'llantas', 'aceite'],
      mood: 'confianza tecnica, ahorro, DIY',
      colors: ['negro industrial', 'naranja mecanico', 'gris metal'],
      lighting: 'luz de taller, practica'
    },
    adStyle: {
      tone: 'experto y economico',
      callToAction: 'Encuentra tu pieza, Envio gratis'
    }
  },
  'education_scholarships': {
    name: 'Becas / Scholarships',
    keywords: ['scholarship', 'beca', 'becas', 'financial aid', 'ayuda financiera', 'estudiar gratis', 'universidad'],
    visualStyle: {
      subjects: ['estudiante graduandose', 'joven estudiando feliz', 'grupo de estudiantes diversos'],
      settings: ['campus universitario', 'biblioteca', 'ceremonia de graduacion', 'aula'],
      props: ['toga y birrete', 'libros', 'diploma', 'laptop', 'mochila'],
      mood: 'esperanza, logro, futuro brillante',
      colors: ['azul academico', 'dorado exito', 'verde esperanza'],
      lighting: 'luz inspiradora, rayos de sol'
    },
    adStyle: {
      tone: 'inspirador y alcanzable',
      callToAction: 'Aplica ahora, Cumple tu sueno'
    }
  },
  'education_courses': {
    name: 'Cursos Online / Online Courses',
    keywords: ['course', 'curso', 'online learning', 'capacitacion', 'training', 'certification', 'certificacion'],
    visualStyle: {
      subjects: ['persona estudiando en laptop', 'profesional tomando notas', 'estudiante con certificado'],
      settings: ['home office', 'cafe', 'escritorio moderno'],
      props: ['laptop', 'audifonos', 'cuaderno', 'cafe', 'certificado'],
      mood: 'superacion personal, flexibilidad, crecimiento',
      colors: ['azul tecnologia', 'naranja energia', 'blanco limpio'],
      lighting: 'luz de pantalla, ambiente de estudio'
    },
    adStyle: {
      tone: 'accesible y profesional',
      callToAction: 'Inscribete hoy, Aprende a tu ritmo'
    }
  },
  'education_degrees': {
    name: 'Titulos Universitarios / University Degrees',
    keywords: ['degree', 'titulo', 'universidad', 'university', 'college', 'carrera', 'licenciatura', 'maestria'],
    visualStyle: {
      subjects: ['estudiante en campus', 'graduado exitoso', 'profesional joven'],
      settings: ['campus universitario prestigioso', 'aula moderna', 'biblioteca'],
      props: ['edificios universitarios', 'libros', 'laptop', 'toga'],
      mood: 'prestigio, inversion en futuro, orgullo',
      colors: ['azul marino institucional', 'dorado', 'blanco'],
      lighting: 'luz clasica institucional'
    },
    adStyle: {
      tone: 'prestigioso pero accesible',
      callToAction: 'Conoce nuestros programas, Solicita informacion'
    }
  },
  'health_medical': {
    name: 'Servicios Medicos / Medical Services',
    keywords: ['medical', 'medico', 'doctor', 'clinic', 'clinica', 'health', 'salud', 'hospital', 'treatment'],
    visualStyle: {
      subjects: ['doctor amable con paciente', 'enfermera sonriendo', 'paciente recuperandose'],
      settings: ['consultorio medico limpio', 'hospital moderno', 'sala de espera'],
      props: ['bata blanca', 'estetoscopio', 'equipos medicos', 'receta'],
      mood: 'confianza, cuidado, profesionalismo',
      colors: ['blanco limpieza', 'azul medico', 'verde salud'],
      lighting: 'luz clinica pero calida'
    },
    adStyle: {
      tone: 'profesional y empatico',
      callToAction: 'Agenda tu cita, Consulta gratis'
    }
  },
  'health_dental': {
    name: 'Dental / Dentist',
    keywords: ['dental', 'dentista', 'teeth', 'dientes', 'smile', 'sonrisa', 'orthodontics', 'ortodoncia'],
    visualStyle: {
      subjects: ['persona con sonrisa perfecta', 'dentista trabajando', 'antes y despues dental'],
      settings: ['consultorio dental moderno', 'espejo mostrando sonrisa'],
      props: ['cepillo de dientes', 'hilo dental', 'silla dental', 'radiografia'],
      mood: 'confianza, belleza, salud',
      colors: ['blanco brillante', 'azul claro', 'menta'],
      lighting: 'luz brillante que resalta sonrisas'
    },
    adStyle: {
      tone: 'transformador y profesional',
      callToAction: 'Sonrie con confianza, Evaluacion gratis'
    }
  },
  'health_weight': {
    name: 'Perdida de Peso / Weight Loss',
    keywords: ['weight loss', 'perdida de peso', 'diet', 'dieta', 'fitness', 'adelgazar', 'slim', 'gym'],
    visualStyle: {
      subjects: ['persona midiendo cintura', 'transformacion antes/despues', 'persona haciendo ejercicio'],
      settings: ['gimnasio', 'cocina saludable', 'parque haciendo ejercicio'],
      props: ['cinta metrica', 'ropa deportiva', 'comida saludable', 'bascula', 'pesas'],
      mood: 'transformacion, motivacion, logro',
      colors: ['verde salud', 'naranja energia', 'azul agua'],
      lighting: 'luz energetica, motivadora'
    },
    adStyle: {
      tone: 'motivador y realista',
      callToAction: 'Comienza hoy, Resultados garantizados'
    }
  },
  'home_solar': {
    name: 'Energia Solar / Solar Energy',
    keywords: ['solar', 'paneles solares', 'solar panels', 'energy', 'energia', 'renewable', 'renovable'],
    visualStyle: {
      subjects: ['casa con paneles solares', 'familia ahorrando', 'instalador en techo'],
      settings: ['techo de casa residencial', 'vecindario soleado', 'factura de luz'],
      props: ['paneles solares', 'sol brillante', 'factura reducida', 'casa moderna'],
      mood: 'ahorro, ecologia, futuro',
      colors: ['azul cielo', 'amarillo sol', 'verde eco'],
      lighting: 'luz solar brillante, dia perfecto'
    },
    adStyle: {
      tone: 'economico y ecologico',
      callToAction: 'Ahorra en tu factura, Cotizacion gratis'
    }
  },
  'home_improvement': {
    name: 'Mejoras del Hogar / Home Improvement',
    keywords: ['home improvement', 'remodelacion', 'renovation', 'kitchen', 'cocina', 'bathroom', 'bano', 'remodel'],
    visualStyle: {
      subjects: ['familia en cocina nueva', 'contratista trabajando', 'antes y despues de remodelacion'],
      settings: ['cocina moderna', 'bano renovado', 'sala remodelada'],
      props: ['herramientas', 'planos', 'muestras de materiales', 'pintura'],
      mood: 'transformacion del hogar, orgullo, valor',
      colors: ['blanco limpio', 'gris moderno', 'madera natural'],
      lighting: 'luz de showroom, espacios amplios'
    },
    adStyle: {
      tone: 'aspiracional y practico',
      callToAction: 'Transforma tu hogar, Presupuesto gratis'
    }
  },
  'home_moving': {
    name: 'Mudanzas / Moving Services',
    keywords: ['moving', 'mudanza', 'relocation', 'mover', 'packing', 'embalaje'],
    visualStyle: {
      subjects: ['familia empacando', 'camion de mudanza', 'trabajadores cargando cajas'],
      settings: ['casa en proceso de mudanza', 'camion estacionado', 'nueva casa vacia'],
      props: ['cajas de carton', 'cinta de embalaje', 'muebles', 'camion'],
      mood: 'nuevo comienzo, emocion, organizacion',
      colors: ['marron carton', 'azul confianza', 'blanco'],
      lighting: 'luz de dia, actividad'
    },
    adStyle: {
      tone: 'confiable y eficiente',
      callToAction: 'Cotiza tu mudanza, Sin estres'
    }
  },
  'legal_injury': {
    name: 'Accidentes / Personal Injury',
    keywords: ['injury', 'accident', 'accidente', 'lawyer', 'abogado', 'compensation', 'compensacion', 'lawsuit'],
    visualStyle: {
      subjects: ['persona con yeso', 'abogado profesional', 'cliente recibiendo cheque'],
      settings: ['oficina de abogado', 'hospital', 'escena de accidente'],
      props: ['documentos legales', 'maletin', 'yeso o vendaje', 'cheque grande'],
      mood: 'justicia, recuperacion, apoyo',
      colors: ['azul marino profesional', 'dorado justicia', 'blanco'],
      lighting: 'luz seria pero esperanzadora'
    },
    adStyle: {
      tone: 'empatico y profesional',
      callToAction: 'Consulta gratis, Luchamos por ti'
    }
  },
  'legal_immigration': {
    name: 'Inmigracion / Immigration',
    keywords: ['immigration', 'inmigracion', 'visa', 'green card', 'citizenship', 'ciudadania', 'residencia'],
    visualStyle: {
      subjects: ['familia reunida', 'persona con pasaporte', 'ceremonia de ciudadania'],
      settings: ['aeropuerto', 'oficina de inmigracion', 'nuevo hogar'],
      props: ['pasaporte', 'bandera', 'documentos', 'maletas'],
      mood: 'esperanza, reunion familiar, nuevo comienzo',
      colors: ['azul cielo', 'rojo y blanco', 'verde esperanza'],
      lighting: 'luz emotiva, calida'
    },
    adStyle: {
      tone: 'esperanzador y profesional',
      callToAction: 'Consulta tu caso, Reunimos familias'
    }
  },
  'retail_shopping': {
    name: 'Compras / Shopping',
    keywords: ['shopping', 'compras', 'deals', 'ofertas', 'discount', 'descuento', 'sale', 'tienda'],
    visualStyle: {
      subjects: ['persona con bolsas de compras', 'unboxing', 'comprando online'],
      settings: ['centro comercial', 'tienda', 'casa recibiendo paquete'],
      props: ['bolsas de compras', 'cajas de paquetes', 'tarjeta de credito', 'celular'],
      mood: 'emocion, satisfaccion, buen trato',
      colors: ['rojo oferta', 'amarillo atencion', 'negro elegante'],
      lighting: 'luz de tienda, atractiva'
    },
    adStyle: {
      tone: 'urgente y emocionante',
      callToAction: 'Compra ahora, Oferta limitada'
    }
  },
  'default': {
    name: 'General',
    keywords: [],
    visualStyle: {
      subjects: ['persona local interactuando con producto/servicio', 'escena cotidiana relevante'],
      settings: ['ambiente tipico del pais', 'contexto urbano o residencial apropiado'],
      props: ['elementos relacionados con la oferta', 'objetos cotidianos del pais'],
      mood: 'positivo, autentico, confiable',
      colors: ['colores que resuenan con la cultura local'],
      lighting: 'luz natural, realista'
    },
    adStyle: {
      tone: 'autentico y directo',
      callToAction: 'Descubre mas, Aprovecha ahora'
    }
  }
};

function classifyVertical(offerName: string, category: string, vertical?: string): string {
  const searchText = `${offerName} ${category} ${vertical || ''}`.toLowerCase();

  let bestMatch = 'default';
  let bestScore = 0;

  for (const [key, template] of Object.entries(VERTICAL_TEMPLATES)) {
    if (key === 'default') continue;

    let score = 0;
    for (const keyword of template.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = key;
    }
  }

  return bestMatch;
}

function getVerticalTemplate(verticalKey: string): VerticalTemplate {
  return VERTICAL_TEMPLATES[verticalKey] || VERTICAL_TEMPLATES['default'];
}

function buildUGCImagePrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  const verticalKey = classifyVertical(
    params.offerName || params.category,
    params.category,
    params.vertical
  );
  const template = getVerticalTemplate(verticalKey);

  const subject = template.visualStyle.subjects[Math.floor(Math.random() * template.visualStyle.subjects.length)];
  const setting = template.visualStyle.settings[Math.floor(Math.random() * template.visualStyle.settings.length)];
  const props = template.visualStyle.props.slice(0, 2).join(', ');
  const colors = template.visualStyle.colors.slice(0, 2).join(' y ');

  return `Foto cuadrada 1080x1080 estilo anuncio de redes sociales para ${params.category} en ${countryName}.

ESCENA: ${subject} en ${setting}. Ambiente autentico de ${countryName} con detalles culturales locales.

ELEMENTOS VISUALES: ${props} visibles naturalmente en la escena. Paleta de colores dominante: ${colors}.

ESTILO VISUAL: Foto de alta calidad pero con aspecto natural y autentico (no stock photo). ${template.visualStyle.lighting}. Composicion atractiva para scroll de redes sociales. ${template.visualStyle.mood}.

TEXTO SUPERPUESTO: Incluir texto grande y legible en ${languageName} que diga exactamente: "${params.adTitle}". El texto debe tener estilo nativo de Instagram/Facebook ads con fondo semi-transparente o sombra para legibilidad.

IMPORTANTE: La imagen debe verse como un anuncio real y efectivo, no como una foto amateur. Debe captar la atencion y comunicar claramente el mensaje de ${template.name.toLowerCase()}.`;
}

function buildUGCVideoPrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

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

ESTILO: Video con movimiento suave pero dinamico. Puede ser estilo testimonial, demostracion, o escena de vida real. ${template.visualStyle.lighting}. Colores vibrantes que capten atencion en el feed.

TONO: ${template.visualStyle.mood}. El video debe transmitir ${template.adStyle.tone}.

TEXTO: Durante todo el video, mostrar texto superpuesto en ${languageName} que diga: "${params.copyMaster}". Estilo de caption de TikTok/Reels con animacion sutil.

DURACION: 5 segundos de contenido atractivo que cuente una mini-historia visual sobre ${template.name.toLowerCase()}.

IMPORTANTE: El video debe verse profesional pero autentico, capaz de detener el scroll y generar interes inmediato.`;
}

/**
 * POST /api/media-debug/generate
 * Generate debug media (images/videos) using AI
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    const {
      category,
      country,
      language,
      adTitle,
      copyMaster,
      offerName,
      vertical,
      platform,
      mediaType,
      count = 1,
      previewOnly = false,
    } = body;

    logger.info('api', 'POST /api/media-debug/generate', {
      category,
      country,
      language,
      platform,
      mediaType,
      count,
      previewOnly,
    });

    // Validate required fields
    if (!category || !adTitle || !copyMaster) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: category, adTitle, copyMaster' },
        { status: 400 }
      );
    }

    // Classify the vertical
    const classifiedVertical = vertical || classifyVertical(offerName || category, category, undefined);

    // Build prompts
    const ugcParams: UGCPromptParams = {
      category,
      country,
      language,
      adTitle,
      copyMaster,
      offerName,
      vertical: classifiedVertical,
    };

    const prompts: { image?: string; video?: string } = {};

    // Generate image prompt if needed
    if (platform === 'META' && (mediaType === 'IMAGE' || mediaType === 'BOTH')) {
      prompts.image = buildUGCImagePrompt(ugcParams);
    }

    // Generate video prompt if needed
    if (mediaType === 'VIDEO' || mediaType === 'BOTH' || platform === 'TIKTOK') {
      prompts.video = buildUGCVideoPrompt(ugcParams);
    }

    // If preview only, return just the prompts
    if (previewOnly) {
      const duration = Date.now() - startTime;
      logger.success('api', 'Media debug prompts generated (preview only)', {}, duration);

      return NextResponse.json({
        success: true,
        data: {
          classifiedVertical,
          prompts,
          media: { images: [], videos: [] },
        },
      });
    }

    // Actually generate media using the AI service
    const { aiService } = await import('@/services/ai.service');

    const media = await aiService.generateUGCMedia({
      campaignId: 'debug-' + Date.now(), // Fake campaign ID for debug
      platform: platform as 'META' | 'TIKTOK',
      mediaType: mediaType as 'IMAGE' | 'VIDEO' | 'BOTH',
      count,
      category,
      country,
      language,
      adTitle,
      copyMaster,
      offerName,
      vertical: classifiedVertical,
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Media debug generated: ${media.images.length} images, ${media.videos.length} videos`, {}, duration);

    return NextResponse.json({
      success: true,
      data: {
        classifiedVertical,
        prompts,
        media,
      },
    });
  } catch (error: any) {
    logger.error('api', `Error in media debug generation: ${error.message}`, {
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
