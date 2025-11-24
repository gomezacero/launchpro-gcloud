
/**
 * Sistema de Lanzamiento Masivo de Campañas TikTok Ads
 * Version: 2.0 - Con configuraciones obligatorias mejoradas
 * Autor: Sistema automatizado para gestión de campañas
 * Actualización: Incluye pixel_id, eventos de optimización, schedule y más
 */

// ==================== CONFIGURACIÓN ====================
const CONFIG = {
  APP_ID: '7481118030941356049', // Pon tu App ID real
  APP_SECRET: '4e0285714bb972c938de84cc155ed79941a73d2f', // Pon tu App Secret real
  ACCESS_TOKEN: '4f5d69310a7d734d25df0e35ae38b2625254db63', // Pon tu Access Token real
  API_BASE_URL: 'https://business-api.tiktok.com/open_api/v1.3',
  
  // Tus Advertiser IDs conocidos
  KNOWN_ADVERTISER_IDS: [
    "7396000534140026897",
    "7420431043557228561", 
    "7426429239521640449",
    "7476563770333167633",
    "7478364576418201617"
  ],
  
  // Nombres de las hojas
  SHEETS: {
    CAMPAIGNS: 'Campañas',
    ADGROUPS: 'Grupos de Anuncios',
    ADS: 'Anuncios',
    CREDENTIALS: 'Credenciales',
    LOGS: 'Logs',
    ADVERTISERS: 'Advertisers',
    PIXELS: 'Pixels',
    IDENTITIES: 'Identidades'
  },
  
  // Eventos de optimización estándar de TikTok
  STANDARD_EVENTS: {
    // Eventos Web más comunes
    PAGE_VIEW: 'PAGE_VIEW',
    BUTTON: 'BUTTON',
    CLICK_LANDING_PAGE: 'CLICK_LANDING_PAGE',
    SEARCH: 'SEARCH',
    ADD_TO_WISHLIST: 'ADD_TO_WISHLIST',
    ON_WEB_CART: 'ON_WEB_CART',  // Agregar al carrito
    ON_WEB_ORDER: 'ON_WEB_ORDER',  // Completar pedido/compra
    ON_WEB_DETAIL: 'ON_WEB_DETAIL',  // Ver detalles del producto
    ON_WEB_REGISTER: 'ON_WEB_REGISTER',  // Registro
    ON_WEB_SUBSCRIBE: 'ON_WEB_SUBSCRIBE',  // Suscripción
    
    // Eventos de formulario/leads
    FORM: 'FORM',
    FORM_DETAIL: 'FORM_DETAIL',
    FORM_BUTTON: 'FORM_BUTTON',
    PHONE: 'PHONE',
    CONSULT: 'CONSULT',
    
    // Eventos de pago/orden
    SUCCESSORDER_PAY: 'SUCCESSORDER_PAY',  // Pago exitoso
    SUCCESSORDER_ACTION: 'SUCCESSORDER_ACTION',  // Acción de orden exitosa
    SHOPPING: 'SHOPPING',
    SHOPPING_ACTION: 'SHOPPING_ACTION',
    
    // Eventos de aplicación
    DOWNLOAD_START: 'DOWNLOAD_START',
    INSTALL_FINISH: 'INSTALL_FINISH',
    REGISTER_ACTION: 'REGISTER_ACTION',
    LOGIN_ACTION: 'LOGIN_ACTION',
    IN_APP_ORDER: 'IN_APP_ORDER',
    IN_APP_PAY: 'IN_APP_PAY',
    
    // Otros eventos comunes
    LANDING_PAGE_VIEW: 'LANDING_PAGE_VIEW',
    CLICK_WEBSITE: 'CLICK_WEBSITE',
    SUBSCRIBE: 'SUBSCRIBE',
    MESSAGE: 'MESSAGE',
    VIEW: 'VIEW'
  },
  
  // Opciones de Call to Action
  CALL_TO_ACTION_OPTIONS: {
    LEARN_MORE: 'LEARN_MORE',
    SHOP_NOW: 'SHOP_NOW',
    DOWNLOAD: 'DOWNLOAD',
    GET_QUOTE: 'GET_QUOTE',
    SUBSCRIBE: 'SUBSCRIBE',
    CONTACT_US: 'CONTACT_US',
    APPLY_NOW: 'APPLY_NOW',
    PLAY_GAME: 'PLAY_GAME',
    WATCH_MORE: 'WATCH_MORE',
    BOOK_NOW: 'BOOK_NOW',
    SIGN_UP: 'SIGN_UP',
    GET_OFFER: 'GET_OFFER',
    ORDER_NOW: 'ORDER_NOW',
    BUY_NOW: 'BUY_NOW',
    BET_NOW: 'BET_NOW',
    DONATE_NOW: 'DONATE_NOW',
    GET_TICKET: 'GET_TICKET',
    INSTALL_NOW: 'INSTALL_NOW',
    USE_APP: 'USE_APP',
    OPEN_LINK: 'OPEN_LINK'
  }
};

// ==================== INICIALIZACIÓN ====================

/**
 * Crea el menú personalizado en Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 TikTok Ads Manager v2.0')
    .addItem('📋 Inicializar hojas', 'initializeSheets')
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ Configuración')
      .addItem('🔑 Configurar credenciales', 'setupManualCredentials')
      .addItem('👥 Cargar Advertiser IDs', 'loadAdvertiserIds')
      .addItem('📊 Cargar Pixels disponibles', 'loadPixels')
      .addItem('👤 Configurar Identidades', 'setupIdentities')
      .addItem('✅ Validar configuración', 'validateConfiguration')
      .addItem('🔧 Ejecutar diagnóstico', 'runDiagnostics'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📁 Gestión de Assets')
      .addItem('🔍 Buscar ID de Imagen por Nombre', 'getLastUploadedImageId')
      .addItem('⬆️ Subir Imagen y Obtener ID', 'uploadImageAndGetId')
      .addItem('📹 Listar Videos Disponibles', 'listAvailableVideos')
      .addItem('🖼️ Listar Imágenes Disponibles', 'listAvailableImages'))
      .addItem('🎥 Buscar ID de Video por Nombre', 'getLastUploadedVideoId')
      .addItem('📹 Subir Video y Obtener ID', 'uploadVideoAndGetId')
      .addItem('ℹ️ Obtener Info de Video', 'getVideoInfo')
    .addSeparator() 
    .addSubMenu(ui.createMenu('🚀 Campañas')
      .addItem('✅ Validar datos', 'validateAllData')
      .addItem('🎯 Lanzar campañas seleccionadas', 'launchSelectedCampaigns')
      .addItem('🌐 Lanzar TODO', 'launchAllCampaigns')
      .addItem('📊 Ver estado de campañas', 'getCampaignStatus'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠️ Utilidades')
      .addItem('🔌 Probar conexión', 'testConnection')
      .addItem('🔄 Actualizar tokens', 'refreshAccessToken')
      .addItem('📊 Ver logs', 'viewLogs')
      .addItem('🗑️ Limpiar logs', 'clearLogs'))
    .addSeparator()
    .addItem('ℹ️ Ayuda', 'showHelp')
    .addToUi();
}

/**
 * Inicializa todas las hojas necesarias con las nuevas columnas
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Crear hoja de Campañas (sin cambios)
  let campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS) || 
                      ss.insertSheet(CONFIG.SHEETS.CAMPAIGNS);
  
  const campaignHeaders = [
    'Seleccionar', 'Advertiser ID', 'Nombre de Campaña', 'Objetivo', 
    'Presupuesto', 'Modo de Presupuesto', 'Estado', 'Campaign ID',
    'Fecha de Creación', 'Mensaje', 'Tipo de Campaña', 'Modo de Optimización de Presupuesto'
  ];
  
  if (campaignSheet.getLastRow() === 0) {
    campaignSheet.getRange(1, 1, 1, campaignHeaders.length).setValues([campaignHeaders]);
    campaignSheet.getRange(1, 1, 1, campaignHeaders.length)
      .setBackground('#4285f4')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    
    // Agregar ejemplos
    const exampleData = [
      [true, '7123456789', 'Campaña Verano 2024', 'CONVERSIONS', 1000, 'BUDGET_MODE_DAY', 'PENDIENTE', '', '', '', 'REGULAR_CAMPAIGN', 'OFF'],
      [false, '7123456789', 'Black Friday 2024', 'TRAFFIC', 500, 'BUDGET_MODE_DAY', 'PENDIENTE', '', '', '', 'REGULAR_CAMPAIGN', 'ON']
    ];
    campaignSheet.getRange(2, 1, exampleData.length, exampleData[0].length).setValues(exampleData);
  }
  
  // Crear hoja de Grupos de Anuncios ACTUALIZADA
  let adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS) || 
                     ss.insertSheet(CONFIG.SHEETS.ADGROUPS);
  
  const adgroupHeaders = [
    'Campaign ID', 'Advertiser ID', 'Nombre del Grupo', 
    'Pixel ID', 'Evento de Optimización', // NUEVAS COLUMNAS
    'Ubicaciones (Placement)', 
    'Tipo de Programación', 'Fecha/Hora Inicio', 'Fecha/Hora Fin', // NUEVAS COLUMNAS
    'Segmentación Horaria', // NUEVA COLUMNA
    'Países', 'Género', 'Edad Min', 'Edad Max', 
    'Presupuesto', 'Modo de Presupuesto', 
    'Evento de Facturación', 'Tipo de Puja', 'Puja', 
    'Meta de Optimización', 'Pacing', // NUEVA COLUMNA
    'Estado', 'AdGroup ID', 'Mensaje'
  ];
  
  if (adgroupSheet.getLastRow() === 0) {
    adgroupSheet.getRange(1, 1, 1, adgroupHeaders.length).setValues([adgroupHeaders]);
    adgroupSheet.getRange(1, 1, 1, adgroupHeaders.length)
      .setBackground('#34a853')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    
    // Agregar ejemplo actualizado
    const exampleAdGroup = [
      ['', '7123456789', 'Grupo Principal', 
       '', 'COMPLETE_PAYMENT', // Pixel ID y Evento
       'PLACEMENT_TIKTOK', // Solo TikTok
       'SCHEDULE_FROM_NOW', '', '', // Programación
       'ALL_DAY', // Todo el día
       'US,CA,MX', 'GENDER_UNLIMITED', 18, 65, 
       100, 'BUDGET_MODE_DAY', 'CPC', 'BID_TYPE_CUSTOM', 0.5, 
       'CONVERSIONS', 'PACING_MODE_SMOOTH', // Pacing
       'PENDIENTE', '', '']
    ];
    adgroupSheet.getRange(2, 1, 1, exampleAdGroup[0].length).setValues(exampleAdGroup);
  }
  
  // Crear hoja de Anuncios ACTUALIZADA
  let adsSheet = ss.getSheetByName(CONFIG.SHEETS.ADS) || 
                 ss.insertSheet(CONFIG.SHEETS.ADS);
  
  const adsHeaders = [
    'AdGroup ID', 'Advertiser ID', 
    'Identidad - Nombre', 'Identidad - Imagen URL', // NUEVAS COLUMNAS
    'Nombre del Anuncio', 'Texto del Anuncio', 
    'URL de Landing Page', 
    'Llamada a la Acción', // ACTUALIZADA con más opciones
    'Video ID', 'Image IDs', 
    'Formato', 'Estado', 'Ad ID', 'Mensaje'
  ];
  
  if (adsSheet.getLastRow() === 0) {
    adsSheet.getRange(1, 1, 1, adsHeaders.length).setValues([adsHeaders]);
    adsSheet.getRange(1, 1, 1, adsHeaders.length)
      .setBackground('#fbbc04')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    
    // Agregar ejemplo actualizado
    const exampleAd = [
      ['', '7123456789', 
       'Tu Marca', '', // Identidad
       'Anuncio Principal', 'Descubre nuestros productos increíbles', 
       'https://tutienda.com', 
       'SHOP_NOW', // Call to Action
       '', '', 
       'SINGLE_VIDEO', 'PENDIENTE', '', '']
    ];
    adsSheet.getRange(2, 1, 1, exampleAd[0].length).setValues(exampleAd);
  }
  
  // Crear hoja de Pixels
  let pixelSheet = ss.getSheetByName(CONFIG.SHEETS.PIXELS) || 
                   ss.insertSheet(CONFIG.SHEETS.PIXELS);
  
  const pixelHeaders = ['Pixel ID', 'Nombre', 'Dominio', 'Estado', 'Eventos Disponibles'];
  if (pixelSheet.getLastRow() === 0) {
    pixelSheet.getRange(1, 1, 1, pixelHeaders.length).setValues([pixelHeaders]);
    pixelSheet.getRange(1, 1, 1, pixelHeaders.length)
      .setBackground('#9333ea')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  
  // Crear hoja de Identidades
  let identitySheet = ss.getSheetByName(CONFIG.SHEETS.IDENTITIES) || 
                      ss.insertSheet(CONFIG.SHEETS.IDENTITIES);
  
  const identityHeaders = ['Identity ID', 'Nombre para Mostrar', 'URL de Imagen', 'Tipo', 'Estado'];
  if (identitySheet.getLastRow() === 0) {
    identitySheet.getRange(1, 1, 1, identityHeaders.length).setValues([identityHeaders]);
    identitySheet.getRange(1, 1, 1, identityHeaders.length)
      .setBackground('#ff6d00')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  
  // Mantener hojas existentes
  let credSheet = ss.getSheetByName(CONFIG.SHEETS.CREDENTIALS) || 
                  ss.insertSheet(CONFIG.SHEETS.CREDENTIALS);
  
  const credHeaders = ['Parámetro', 'Valor'];
  if (credSheet.getLastRow() === 0) {
    credSheet.getRange(1, 1, 1, 2).setValues([credHeaders]);
    const credData = [
      ['APP_ID', ''],
      ['APP_SECRET', ''],
      ['ACCESS_TOKEN', ''],
      ['REFRESH_TOKEN', '']
    ];
    credSheet.getRange(2, 1, credData.length, 2).setValues(credData);
    credSheet.getRange(1, 1, credData.length + 1, 2)
      .setBackground('#ea4335')
      .setFontColor('#ffffff');
  }
  
  // Hoja de Logs
  let logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS) || 
                 ss.insertSheet(CONFIG.SHEETS.LOGS);
  
  const logHeaders = ['Fecha/Hora', 'Tipo', 'Mensaje', 'Detalles'];
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 4).setValues([logHeaders]);
    logSheet.getRange(1, 1, 1, 4)
      .setBackground('#666666')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  
  // Configurar validaciones de datos
  setupDataValidations();
  
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Hojas inicializadas con nuevas configuraciones', 'Éxito', 3);
}

/**
 * Configura las validaciones de datos para las columnas
 */
function setupDataValidations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS);
  const adsSheet = ss.getSheetByName(CONFIG.SHEETS.ADS);
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  
  // VALIDACIONES PARA CAMPAÑAS
  if (campaignSheet) {
    // Validación para Objetivo
    const objectiveValues = [
      'CONVERSIONS',
      'TRAFFIC', 
      'VIDEO_VIEWS',
      'REACH',
      'APP_INSTALLS',
      'LEAD_GENERATION',
      'ENGAGEMENT',
      'CATALOG_SALES'
    ];
    const objectiveRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(objectiveValues)
      .setAllowInvalid(false)
      .setHelpText('Selecciona un objetivo de campaña')
      .build();
    campaignSheet.getRange(2, 4, 100, 1).setDataValidation(objectiveRule); // Columna D
    
    // Validación para Modo de Presupuesto
    const budgetModeValues = ['BUDGET_MODE_DAY', 'BUDGET_MODE_TOTAL'];
    const budgetModeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(budgetModeValues)
      .setAllowInvalid(false)
      .setHelpText('DAY = Presupuesto diario, TOTAL = Presupuesto total')
      .build();
    campaignSheet.getRange(2, 6, 100, 1).setDataValidation(budgetModeRule); // Columna F
    
    // Validación para Tipo de Campaña
    const campaignTypeValues = ['REGULAR_CAMPAIGN', 'SMART_CAMPAIGN'];
    const campaignTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(campaignTypeValues)
      .setAllowInvalid(false)
      .setHelpText('Tipo de campaña')
      .build();
    campaignSheet.getRange(2, 11, 100, 1).setDataValidation(campaignTypeRule); // Columna K
    
    // Validación para CBO (Campaign Budget Optimization)
    const cboValues = ['ON', 'OFF'];
    const cboRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(cboValues)
      .setAllowInvalid(false)
      .setHelpText('Activar o desactivar optimización de presupuesto de campaña')
      .build();
    campaignSheet.getRange(2, 12, 100, 1).setDataValidation(cboRule); // Columna L
  }
  
  // VALIDACIONES PARA GRUPOS DE ANUNCIOS
  if (adgroupSheet) {
    // Validación para Evento de Optimización - VALORES CORRECTOS DE TIKTOK
    const eventValues = [
      'ON_WEB_ORDER',         // Orden completada (conversión principal)
      'SUCCESSORDER_PAY',     // Pago exitoso
      'ON_WEB_CART',         // Agregar al carrito
      'ON_WEB_DETAIL',       // Ver detalles del producto
      'ON_WEB_REGISTER',     // Registro en web
      'ON_WEB_SUBSCRIBE',    // Suscripción
      'FORM',                // Formulario enviado
      'FORM_DETAIL',         // Formulario detallado
      'PHONE',               // Llamada telefónica
      'PAGE_VIEW',           // Vista de página
      'LANDING_PAGE_VIEW',   // Vista de landing page
      'CLICK_LANDING_PAGE',  // Clic en landing
      'BUTTON',              // Clic en botón
      'SUBSCRIBE',           // Suscripción general
      'MESSAGE',             // Mensaje/Chat
      'CONSULT',             // Consulta
      'SEARCH',              // Búsqueda
      'VIEW',                // Vista general
      'SHOPPING_ACTION',     // Acción de compra
      'ADD_TO_WISHLIST'      // Agregar a lista de deseos
    ];
    
    const eventRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(eventValues)
      .setAllowInvalid(false)
      .setHelpText('Selecciona un evento de optimización válido. Para e-commerce usa ON_WEB_ORDER o SUCCESSORDER_PAY')
      .build();
    adgroupSheet.getRange(2, 5, 100, 1).setDataValidation(eventRule); // Columna E
    
    // Validación para Placement - OBLIGATORIO PLACEMENT_TIKTOK
    const placementRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['PLACEMENT_TIKTOK'])
      .setAllowInvalid(false)
      .setHelpText('Solo se permite PLACEMENT_TIKTOK')
      .build();
    adgroupSheet.getRange(2, 6, 100, 1).setDataValidation(placementRule); // Columna F
    
    // Validación para Tipo de Programación
    const scheduleTypeValues = ['SCHEDULE_FROM_NOW', 'SCHEDULE_START_END'];
    const scheduleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(scheduleTypeValues)
      .setAllowInvalid(false)
      .setHelpText('FROM_NOW = Empieza ahora, START_END = Fechas específicas')
      .build();
    adgroupSheet.getRange(2, 7, 100, 1).setDataValidation(scheduleRule); // Columna G
    
    // Validación para Segmentación Horaria
    const dayPartingValues = ['ALL_DAY', 'CUSTOM'];
    const dayPartingRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(dayPartingValues)
      .setAllowInvalid(false)
      .setHelpText('ALL_DAY = Todo el día, CUSTOM = Horario personalizado')
      .build();
    adgroupSheet.getRange(2, 10, 100, 1).setDataValidation(dayPartingRule); // Columna J
    
    // Validación para Género
    const genderValues = ['GENDER_UNLIMITED', 'GENDER_MALE', 'GENDER_FEMALE'];
    const genderRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(genderValues)
      .setAllowInvalid(false)
      .setHelpText('Selecciona el género objetivo')
      .build();
    adgroupSheet.getRange(2, 12, 100, 1).setDataValidation(genderRule); // Columna L
    
    // Validación para Modo de Presupuesto
    const adgroupBudgetModeValues = ['BUDGET_MODE_DAY', 'BUDGET_MODE_TOTAL'];
    const adgroupBudgetModeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(adgroupBudgetModeValues)
      .setAllowInvalid(false)
      .setHelpText('DAY = Presupuesto diario, TOTAL = Presupuesto total')
      .build();
    adgroupSheet.getRange(2, 16, 100, 1).setDataValidation(adgroupBudgetModeRule); // Columna P
    
    // Validación para Evento de Facturación
    const billingEventValues = ['CPC', 'CPM', 'CPV', 'OCPM'];
    const billingEventRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(billingEventValues)
      .setAllowInvalid(false)
      .setHelpText('Modelo de facturación: CPC, CPM, CPV, OCPM (usa OCPM para conversiones)')
      .build();
    adgroupSheet.getRange(2, 17, 100, 1).setDataValidation(billingEventRule); // Columna Q
    
    // Validación para Tipo de Puja
    const bidTypeValues = ['BID_TYPE_CUSTOM', 'BID_TYPE_NO_BID'];
    const bidTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(bidTypeValues)
      .setAllowInvalid(false)
      .setHelpText('CUSTOM = Puja manual, NO_BID = Puja automática')
      .build();
    adgroupSheet.getRange(2, 18, 100, 1).setDataValidation(bidTypeRule); // Columna R
    
    // ⭐ VALIDACIÓN CORREGIDA PARA META DE OPTIMIZACIÓN ⭐
    const optimizeGoalValues = [
      'CONVERT',              // Para conversiones web estándar
      'VALUE',                // Para optimización por valor (VBO)
      'CLICK',                // Para clics/tráfico
      'REACH',                // Para alcance
      'INSTALL',              // Para instalación de apps
      'IN_APP_EVENT',         // Para eventos en app
      'LEAD_GENERATION',      // Para generación de leads
      'ENGAGED_VIEW',         // Para vistas comprometidas
      'VIDEO_VIEW',           // Para vistas de video
      'TRAFFIC_LANDING_PAGE_VIEW' // Para vistas de landing page
    ];
    const optimizeGoalRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(optimizeGoalValues)
      .setAllowInvalid(false)
      .setHelpText('Meta de optimización. Para conversiones web con pixel usa CONVERT')
      .build();
    adgroupSheet.getRange(2, 20, 100, 1).setDataValidation(optimizeGoalRule); // Columna T
    
    // Validación para Pacing
    const pacingValues = ['PACING_MODE_SMOOTH', 'PACING_MODE_FAST'];
    const pacingRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(pacingValues)
      .setAllowInvalid(false)
      .setHelpText('SMOOTH = Distribución uniforme, FAST = Gasto acelerado')
      .build();
    adgroupSheet.getRange(2, 21, 100, 1).setDataValidation(pacingRule); // Columna U
  }
  
  // VALIDACIONES PARA ANUNCIOS
  if (adsSheet) {
    // Validación para Call to Action
    const ctaValues = [
      'LEARN_MORE',
      'SHOP_NOW',
      'DOWNLOAD',
      'GET_QUOTE',
      'SUBSCRIBE',
      'CONTACT_US',
      'APPLY_NOW',
      'PLAY_GAME',
      'WATCH_MORE',
      'BOOK_NOW',
      'SIGN_UP',
      'GET_OFFER',
      'ORDER_NOW',
      'BUY_NOW',
      'BET_NOW',
      'DONATE_NOW',
      'GET_TICKET',
      'INSTALL_NOW',
      'USE_APP',
      'OPEN_LINK'
    ];
    
    const ctaRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(ctaValues)
      .setAllowInvalid(false)
      .setHelpText('Selecciona una llamada a la acción')
      .build();
    adsSheet.getRange(2, 8, 100, 1).setDataValidation(ctaRule); // Columna H
    
    // Validación para Formato de Anuncio
    const formatValues = [
      'SINGLE_VIDEO',
      'SINGLE_IMAGE',
      'CAROUSEL'
    ];
    
    const formatRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(formatValues)
      .setAllowInvalid(false)
      .setHelpText('Formato del anuncio')
      .build();
    adsSheet.getRange(2, 11, 100, 1).setDataValidation(formatRule); // Columna K
  }
  
  // Agregar validación de países (códigos ISO) con nota de ayuda
  if (adgroupSheet) {
    const countryHelpText = 'Usa códigos de país ISO separados por comas. Ej: US,MX,CA,BR,ES,FR,GB';
    adgroupSheet.getRange(2, 11, 100, 1).setNote(countryHelpText); // Columna K - Países
    
    // Agregar notas de ayuda para edades
    adgroupSheet.getRange(2, 13, 100, 1).setNote('Edad mínima: 13-65'); // Columna M
    adgroupSheet.getRange(2, 14, 100, 1).setNote('Edad máxima: 13-65'); // Columna N
    
    // ⭐ NOTA IMPORTANTE PARA LA COLUMNA DE META DE OPTIMIZACIÓN ⭐
    adgroupSheet.getRange(2, 20, 100, 1).setNote(
      'Para campañas de CONVERSIONS web, usa "CONVERSIONS". ' +
      'NO uses "VALUE" a menos que tengas VBO (Value-Based Optimization) configurado.'
    ); // Columna T
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Validaciones de datos configuradas correctamente', 'Éxito', 3);
}



// ==================== FUNCIONES DE API ACTUALIZADAS ====================

/**
 * Crea una campaña en TikTok
 */
function createCampaign(campaignData) {
  const payload = {
    advertiser_id: campaignData.advertiserId,
    campaign_name: campaignData.campaignName,
    objective_type: campaignData.objective,
    campaign_type: campaignData.campaignType || 'REGULAR_CAMPAIGN'
  };
  
  // ⭐ SOLUCIÓN: TikTok SIEMPRE requiere budget_mode
  // Opción 1: Usar el presupuesto mínimo cuando quieres "sin límite"
  if (!campaignData.budget || parseFloat(campaignData.budget) <= 0) {
    // Establecer el presupuesto mínimo permitido ($50)
    payload.budget_mode = 'BUDGET_MODE_DAY';
    payload.budget = 50; // Presupuesto mínimo
    
    logMessage('INFO', 'Presupuesto mínimo de campaña establecido', 
      '$50 diario (mínimo requerido por TikTok). Control real en AdGroups.');
  } else {
    // Usar el presupuesto especificado
    payload.budget_mode = campaignData.budgetMode || 'BUDGET_MODE_DAY';
    payload.budget = parseFloat(campaignData.budget);
    
    logMessage('INFO', 'Presupuesto de campaña establecido', 
      `$${payload.budget} (${payload.budget_mode})`);
  }
  
  // Si CBO está activado
  if (campaignData.cbo === 'ON') {
    payload.operation_status = 'ENABLE';
  } else {
    payload.operation_status = 'ENABLE';
  }
  
  logMessage('DEBUG', 'Payload para crear campaña', JSON.stringify(payload));
  
  const result = makeApiCall('/campaign/create/', 'POST', payload, campaignData.advertiserId);
  
  if (result.data && result.data.campaign_id) {
    logMessage('SUCCESS', `Campaña creada: ${campaignData.campaignName}`, 
      `ID: ${result.data.campaign_id} | Presupuesto: $${payload.budget} ${payload.budget_mode}`);
    return result.data.campaign_id;
  }
  
  throw new Error('No se pudo crear la campaña');
}

function updateCampaignSheetInstructions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  
  if (campaignSheet) {
    // Agregar nota en la columna de Presupuesto
    campaignSheet.getRange(1, 5).setNote(
      'OPCIONAL: Deja vacío o en 0 para "Sin Límite" (recomendado).\n' +
      'El presupuesto real se controlará a nivel de Grupo de Anuncios.\n' +
      'Mínimo: $50 USD si se especifica.'
    );
    
    // Cambiar el color de fondo para indicar que es opcional
    campaignSheet.getRange(2, 5, 100, 1).setBackground('#f0f0f0');
  }
}

/**
 * Crea un grupo de anuncios con las nuevas configuraciones
 */
/**
 * Crea un grupo de anuncios con presupuesto obligatorio
 */
function createAdGroup(adGroupData) {
  try {
    logMessage('DEBUG', 'Iniciando createAdGroup', JSON.stringify(adGroupData));
    
    // ⭐ VALIDACIÓN IMPORTANTE: El presupuesto es OBLIGATORIO a nivel de AdGroup
    if (!adGroupData.budget || parseFloat(adGroupData.budget) < 20) {
      throw new Error('El presupuesto del grupo de anuncios debe ser mínimo $20 USD');
    }
    
    // Procesar códigos de país
    let locationIds = [];
    if (adGroupData.countries) {
      const countryCodesMap = {
        'US': '6252001',
        'MX': '3996063',
        'CA': '6251999',
        'BR': '3469034',
        'AR': '3865483',
        'GB': '2635167',
        'FR': '3017382',
        'DE': '2921044',
        'ES': '2510769',
        'IT': '3175395'
      };
      
      const countryCodes = adGroupData.countries.split(',').map(code => code.trim().toUpperCase());
      locationIds = countryCodes.map(code => countryCodesMap[code] || code).filter(id => id);
      
      logMessage('DEBUG', 'Códigos de país procesados', `Input: ${adGroupData.countries} -> Output: ${JSON.stringify(locationIds)}`);
    }
    
    // Configurar placements
    let placements = [];
    const placementValue = adGroupData.placement ? adGroupData.placement.toUpperCase() : 'PLACEMENT_TIKTOK';
    
    if (placementValue === 'PLACEMENT_TIKTOK') {
      placements = ['PLACEMENT_TIKTOK'];
    } else if (placementValue === 'PLACEMENT_PANGLE') {
      placements = ['PLACEMENT_PANGLE'];
    } else if (placementValue === 'PLACEMENT_ALL') {
      placements = ['PLACEMENT_TIKTOK', 'PLACEMENT_PANGLE'];
    } else {
      placements = [placementValue];
    }
    
    logMessage('INFO', 'Placements configurados', JSON.stringify(placements));
    
    // Configurar el payload
    const payload = {
      advertiser_id: adGroupData.advertiserId,
      campaign_id: adGroupData.campaignId,
      adgroup_name: adGroupData.name,
      placement_type: 'PLACEMENT_TYPE_NORMAL',
      placements: placements,
      location_ids: locationIds,
      gender: adGroupData.gender || 'GENDER_UNLIMITED',
      // ⭐ PRESUPUESTO OBLIGATORIO A NIVEL DE ADGROUP
      budget_mode: adGroupData.budgetMode || 'BUDGET_MODE_DAY',
      budget: parseFloat(adGroupData.budget)
    };
    
    logMessage('INFO', `Presupuesto de AdGroup configurado`, 
      `$${payload.budget} ${payload.budget_mode === 'BUDGET_MODE_DAY' ? 'diario' : 'total'}`);
    
    // Agregar edad si se especifica
    if (adGroupData.ageMin && adGroupData.ageMax) {
      payload.age = [parseInt(adGroupData.ageMin), parseInt(adGroupData.ageMax)];
    }
    
    // Configurar billing y optimización
    payload.billing_event = adGroupData.billingEvent || 'OCPM';
    payload.bid_type = adGroupData.bidType || 'BID_TYPE_NO_BID';
    payload.optimization_goal = adGroupData.optimizationGoal || 'CONVERT';
    
    // Para conversiones web, agregar evento de optimización y pixel
    if (adGroupData.optimizationEvent) {
      payload.optimization_event = adGroupData.optimizationEvent;
    }
    
    // Configurar tipo de promoción
    if (payload.optimization_goal === 'CONVERT' || payload.optimization_goal === 'TRAFFIC') {
      payload.promotion_type = 'WEBSITE';
      
      if (adGroupData.pixelId) {
        payload.pixel_id = adGroupData.pixelId;
      }
    }
    
    // Configurar pacing
    payload.pacing = adGroupData.pacing || 'PACING_MODE_SMOOTH';
    
    // Configurar schedule
    payload.schedule_type = adGroupData.scheduleType || 'SCHEDULE_FROM_NOW';
    
    if (payload.schedule_type === 'SCHEDULE_FROM_NOW') {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      payload.schedule_start_time = formatDateTime(now);
    } else if (adGroupData.scheduleStart) {
      payload.schedule_start_time = adGroupData.scheduleStart;
    }
    
    if (adGroupData.scheduleEnd) {
      payload.schedule_end_time = adGroupData.scheduleEnd;
    }
    
    // Configurar bid si existe
    if (adGroupData.bid) {
      payload.bid = parseFloat(adGroupData.bid);
      if (payload.optimization_goal === 'CONVERT') {
        payload.deep_cpa_bid = parseFloat(adGroupData.bid);
      }
    }
    
    logMessage('DEBUG', 'Payload completo antes de API call', JSON.stringify(payload));
    
    const result = makeApiCall('/adgroup/create/', 'POST', payload, adGroupData.advertiserId);
    
    if (result.data && result.data.adgroup_id) {
      logMessage('SUCCESS', `Grupo de anuncios creado: ${adGroupData.name}`, 
        `ID: ${result.data.adgroup_id} | Presupuesto: $${payload.budget}`);
      return result.data.adgroup_id;
    }
    
    throw new Error('No se pudo crear el grupo de anuncios');
    
  } catch (error) {
    logMessage('ERROR', 'Error en createAdGroup', error.toString());
    throw error;
  }
}

// Función auxiliar para formatear fecha/hora
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Crea un anuncio con las nuevas configuraciones de identidad
 */
function createAd(adData) {
  try {
    let identityId = adData.identityId;
    let identityType = (!identityId || identityId === '' || identityId === 'ADVERTISER') 
      ? 'UNSET' 
      : 'CUSTOMIZED_USER';
    
    if (!identityId || identityId === '') {
      identityId = 'ADVERTISER';
    }
    
    const creative = {
      ad_name: adData.adName,
      ad_text: adData.adText,
      ad_format: adData.format || 'SINGLE_VIDEO',
      call_to_action: adData.callToAction || 'LEARN_MORE',
      landing_page_url: adData.landingPageUrl,
      identity_id: identityId,
      identity_type: identityType
    };
    
    // LÓGICA CORREGIDA PARA SINGLE_VIDEO
    if (creative.ad_format === 'SINGLE_VIDEO') {
      if (!adData.videoId) {
        throw new Error('Se requiere video_id para SINGLE_VIDEO');
      }
      creative.video_id = adData.videoId;
      
      // ⭐ IMPORTANTE: Para SINGLE_VIDEO, image_ids debe ser un array
      if (adData.imageIds) {
        // Convertir a array si es string
        if (typeof adData.imageIds === 'string' && adData.imageIds.trim() !== '') {
          creative.image_ids = [adData.imageIds.trim()];
          logMessage('INFO', 'Agregando imagen como thumbnail', adData.imageIds);
        } else if (Array.isArray(adData.imageIds)) {
          creative.image_ids = adData.imageIds;
        }
      }
    }
    else if (creative.ad_format === 'SINGLE_IMAGE') {
      // Para anuncios de solo imagen
      if (!adData.imageIds) {
        throw new Error('Se requiere image_ids para SINGLE_IMAGE');
      }
      
      if (typeof adData.imageIds === 'string') {
        creative.image_ids = [adData.imageIds];
      } else {
        creative.image_ids = adData.imageIds;
      }
    }
    
    const payload = {
      advertiser_id: adData.advertiserId,
      adgroup_id: adData.adgroupId,
      creatives: [creative]
    };
    
    // Agregar pixel_id si existe
    if (adData.pixelId) {
      payload.tracking_pixel_id = adData.pixelId;
    }
    
    logMessage('DEBUG', 'Payload final para /ad/create/', JSON.stringify(payload));
    
    const result = makeApiCall('/ad/create/', 'POST', payload, adData.advertiserId);
    
    if (result.data && result.data.ad_ids && result.data.ad_ids.length > 0) {
      logMessage('SUCCESS', `Anuncio creado: ${adData.adName}`, `ID: ${result.data.ad_ids[0]}`);
      return result.data.ad_ids[0];
    }
    
    throw new Error('No se pudo crear el anuncio');
    
  } catch (error) {
    logMessage('ERROR', 'Error en createAd', error.toString());
    throw error;
  }
}

/**
 * Formatea fecha y hora al formato requerido por TikTok
 */
function formatDateTime(dateString) {
  if (!dateString) {
    // Si no hay fecha, usar la fecha actual
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Agregar 5 minutos para evitar problemas
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  
  // Si ya es un objeto Date
  if (dateString instanceof Date) {
    const date = dateString;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  
  // Convertir a string si no lo es
  const dateStr = String(dateString);
  
  // Si ya está en el formato correcto, devolverlo
  if (dateStr.match && dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    return dateStr;
  }
  
  // Intentar parsear la fecha
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Si no se puede parsear, usar fecha actual
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  
  // Formatear como YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ==================== NUEVAS FUNCIONES DE CONFIGURACIÓN ====================

/**
 * Carga los pixels disponibles para el advertiser
 */
function loadPixels() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pixelSheet = ss.getSheetByName(CONFIG.SHEETS.PIXELS);
    
    if (!pixelSheet) {
      ui.alert('Error', 'No se encuentra la hoja de Pixels', ui.ButtonSet.OK);
      return;
    }
    
    // Para cada advertiser, obtener sus pixels
    const advertiserIds = CONFIG.KNOWN_ADVERTISER_IDS;
    const allPixels = [];
    
    advertiserIds.forEach(advertiserId => {
      try {
        const result = makeApiCall(
          `/pixel/list/?advertiser_id=${advertiserId}`,
          'GET',
          null,
          advertiserId
        );
        
        if (result.data && result.data.pixels) {
          result.data.pixels.forEach(pixel => {
            allPixels.push([
              pixel.pixel_id,
              pixel.pixel_name || 'Sin nombre',
              pixel.domain || '',
              pixel.status || 'ACTIVO',
              'PageView, AddToCart, CompletePayment, etc.'
            ]);
          });
        }
      } catch (error) {
        console.log(`Error obteniendo pixels para ${advertiserId}:`, error);
      }
    });
    
    // Si no hay pixels, crear algunos de ejemplo
    if (allPixels.length === 0) {
      allPixels.push(
        ['pixel_123456', 'Pixel Principal', 'tutienda.com', 'ACTIVO', 'Todos los eventos'],
        ['pixel_789012', 'Pixel Secundario', 'landing.tutienda.com', 'ACTIVO', 'Conversiones']
      );
    }
    
    // Limpiar y actualizar la hoja
    if (pixelSheet.getLastRow() > 1) {
      pixelSheet.getRange(2, 1, pixelSheet.getLastRow() - 1, 5).clearContent();
    }
    
    if (allPixels.length > 0) {
      pixelSheet.getRange(2, 1, allPixels.length, 5).setValues(allPixels);
    }
    
    // Configurar dropdown en la hoja de Ad Groups
    const pixelIds = allPixels.map(row => row[0]);
    setupPixelDropdown(pixelIds);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `✅ ${allPixels.length} pixels cargados`, 
      'Éxito', 
      3
    );
    
  } catch (error) {
    ui.alert('Error', 'Error al cargar pixels: ' + error.message, ui.ButtonSet.OK);
  }
}

/**
 * Configura el dropdown de Pixel IDs en la hoja de Ad Groups
 */
function setupPixelDropdown(pixelIds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS);
  
  if (!adgroupSheet || pixelIds.length === 0) {
    return;
  }
  
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(pixelIds)
    .setAllowInvalid(true)
    .setHelpText('Selecciona un Pixel ID o déjalo vacío')
    .build();
  
  // Aplicar a la columna de Pixel ID (columna 4)
  adgroupSheet.getRange(2, 4, 100, 1).setDataValidation(rule);
}

/**
 * Configura las identidades personalizadas
 */
function setupIdentities() {
  const html = HtmlService.createHtmlOutput(`
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>👤 Configurar Identidades</h2>
      
      <div style="background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <p><strong>ℹ️ ¿Qué son las Identidades?</strong></p>
        <p>Las identidades son como las "Fan Pages" de Meta. Definen cómo aparece tu marca en los anuncios de TikTok.</p>
        <p>Puedes usar:</p>
        <ul>
          <li><strong>Custom Identity:</strong> Crear una identidad personalizada con nombre y foto</li>
          <li><strong>TikTok Account:</strong> Usar una cuenta TikTok existente (requiere autorización)</li>
        </ul>
      </div>
      
      <h3>Crear Identidad Personalizada</h3>
      
      <label>Nombre para Mostrar:</label><br>
      <input type="text" id="displayName" placeholder="Ej: Tu Marca" style="width: 100%; margin-bottom: 10px;"><br>
      
      <label>URL de Imagen de Perfil (opcional):</label><br>
      <input type="text" id="profileImage" placeholder="https://..." style="width: 100%; margin-bottom: 10px;"><br>
      
      <label>Notas:</label><br>
      <textarea id="notes" style="width: 100%; height: 60px; margin-bottom: 20px;" placeholder="Notas sobre esta identidad"></textarea><br>
      
      <button onclick="saveIdentity()" style="background: #4285f4; color: white; padding: 10px 20px; border: none; cursor: pointer;">
        💾 Guardar Identidad
      </button>
      
      <script>
        function saveIdentity() {
          const data = {
            displayName: document.getElementById('displayName').value,
            profileImage: document.getElementById('profileImage').value,
            notes: document.getElementById('notes').value
          };
          
          if (!data.displayName) {
            alert('El nombre para mostrar es obligatorio');
            return;
          }
          
          google.script.run
            .withSuccessHandler(() => {
              alert('Identidad guardada correctamente');
              google.script.host.close();
            })
            .withFailureHandler(error => {
              alert('Error: ' + error.message);
            })
            .saveIdentityData(data);
        }
      </script>
    </div>
  `)
  .setWidth(500)
  .setHeight(500);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Configurar Identidades');
}

/**
 * Guarda los datos de identidad
 */
function saveIdentityData(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const identitySheet = ss.getSheetByName(CONFIG.SHEETS.IDENTITIES);
  
  if (!identitySheet) {
    throw new Error('No se encuentra la hoja de Identidades');
  }
  
  // Generar un ID único
  const identityId = 'identity_' + Date.now();
  
  // Agregar la nueva identidad
  identitySheet.appendRow([
    identityId,
    data.displayName,
    data.profileImage || '',
    'CUSTOM',
    'ACTIVO'
  ]);
  
  logMessage('SUCCESS', 'Identidad creada', `${data.displayName} (${identityId})`);
}

// ==================== FUNCIONES DE LANZAMIENTO ACTUALIZADAS ====================

/**
 * Lanza las campañas seleccionadas con las nuevas configuraciones
 */
function launchSelectedCampaigns() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
    const adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS);
    const adsSheet = ss.getSheetByName(CONFIG.SHEETS.ADS);
    
    if (!campaignSheet || !adgroupSheet || !adsSheet) {
      throw new Error('No se encontraron todas las hojas necesarias');
    }
    
    // Obtener datos de las hojas
    const campaignData = campaignSheet.getDataRange().getValues();
    const adgroupData = adgroupSheet.getDataRange().getValues();
    const adsData = adsSheet.getDataRange().getValues();
    
    let campaignsCreated = 0;
    let errors = 0;
    
    logMessage('INFO', 'Iniciando lanzamiento de campañas', `Total campañas: ${campaignData.length - 1}`);
    
    // Procesar campañas (empezando desde fila 2, índice 1)
    for (let i = 1; i < campaignData.length; i++) {
      const row = campaignData[i];
      
      // Verificar si la campaña está marcada para lanzar
      if (row[0] !== true) continue;
      
      const campaignName = row[2];
      const advertiserId = row[1];
      
      if (!campaignName || !advertiserId) continue;
      
      logMessage('INFO', `Procesando campaña: ${campaignName}`, `Advertiser: ${advertiserId}`);
      
      try {
        // Crear campaña
        const campaignId = createCampaign({
          advertiserId: advertiserId,
          campaignName: campaignName,
          objective: row[3],
          budget: row[4],
          budgetMode: row[5] || 'BUDGET_MODE_DAY',
          campaignType: row[10] || 'REGULAR_CAMPAIGN',
          cbo: row[11] || 'OFF'
        });
        
        if (campaignId) {
          logMessage('SUCCESS', `Campaña creada: ${campaignName}`, `ID: ${campaignId}`);
          campaignsCreated++;
          
          // Actualizar el Campaign ID en la hoja
          campaignSheet.getRange(i + 1, 8).setValue(campaignId);
          
          // Buscar y crear grupos de anuncios para esta campaña
          logMessage('INFO', 'Buscando grupos de anuncios', `Para campaña: ${campaignName}`);
          
          for (let j = 1; j < adgroupData.length; j++) {
            const adgroupRow = adgroupData[j];
            const campaignRef = adgroupRow[0];
            const adgroupAdvertiserID = adgroupRow[1];
            
            logMessage('DEBUG', 'Comparando grupo de anuncios',
              `Campaign Ref: "${campaignRef}" vs Campaign Name: "${campaignName}" | ` +
              `AdGroup AdvertiserID: "${adgroupAdvertiserID}" vs Campaign AdvertiserID: "${advertiserId}"`
            );
            
            if (campaignRef === campaignName && adgroupAdvertiserID === advertiserId) {
              logMessage('INFO', `Grupo encontrado: ${adgroupRow[2]}`, `Fila ${j + 1}`);
              
              try {
                // Crear grupo de anuncios
                const adgroupId = createAdGroup({
                  advertiserId: adgroupAdvertiserID,
                  campaignId: campaignId,
                  name: adgroupRow[2],
                  pixelId: adgroupRow[3],
                  optimizationEvent: adgroupRow[4],
                  placement: adgroupRow[5],
                  scheduleType: adgroupRow[6] || 'SCHEDULE_FROM_NOW',
                  scheduleStart: adgroupRow[7],
                  scheduleEnd: adgroupRow[8],
                  dayParting: adgroupRow[9],
                  countries: adgroupRow[10],
                  gender: adgroupRow[11],
                  ageMin: adgroupRow[12],
                  ageMax: adgroupRow[13],
                  budget: adgroupRow[14],
                  budgetMode: adgroupRow[15],
                  billingEvent: adgroupRow[16],
                  bidType: adgroupRow[17],
                  bid: adgroupRow[18],
                  optimizationGoal: adgroupRow[19],
                  pacing: adgroupRow[20] || 'PACING_MODE_SMOOTH'
                });
                
                if (adgroupId) {
                  logMessage('SUCCESS', `Grupo creado: ${adgroupRow[2]}`, `ID: ${adgroupId}`);
                  
                  // Actualizar el AdGroup ID en la hoja
                  adgroupSheet.getRange(j + 1, 22).setValue(adgroupId);
                  
                  // Procesar anuncios para este grupo
                  for (let a = 1; a < adsData.length; a++) {
                    const adRow = adsData[a];
                    
                    // MAPEO CORRECTO DE COLUMNAS
                    const adGroupRef = adRow[0];          // Columna A - AdGroup ID/Nombre de referencia
                    const adAdvertiserID = adRow[1];      // Columna B - Advertiser ID  
                    const adIdentityId = adRow[2];        // Columna C - Identity ID
                    const identityName = adRow[3];        // Columna D - Identidad Nombre
                    const identityImageUrl = adRow[4];    // Columna E - Identidad Imagen URL
                    const adName = adRow[5];              // Columna F - Nombre del Anuncio
                    const adText = adRow[6];              // Columna G - Texto del Anuncio
                    const landingPageUrl = adRow[7];      // Columna H - URL de Landing Page
                    const callToAction = adRow[8];        // Columna I - Llamada a la Acción
                    const videoId = adRow[9];             // Columna J - Video ID
                    const imageIds = adRow[10];           // Columna K - Image IDs
                    const format = adRow[11];             // Columna L - Formato
                    
                    // Verificar si el anuncio pertenece a este grupo
                    if ((adGroupRef === adgroupId || adGroupRef === adgroupRow[2]) && 
                        adAdvertiserID === advertiserId) {
                      
                      logMessage('INFO', `Anuncio encontrado: ${adName}`, `Fila ${a + 1}`);
                      
                      try {
                        const adId = createAd({
                          advertiserId: adAdvertiserID,
                          adgroupId: adgroupId,
                          identityId: adIdentityId,
                          adName: adName,
                          adText: adText,
                          landingPageUrl: landingPageUrl,
                          callToAction: callToAction,
                          videoId: videoId,
                          imageIds: imageIds,
                          format: format,
                          pixelId: adgroupRow[3]  // Usar el pixel del grupo
                        });
                        
                        if (adId) {
                          logMessage('SUCCESS', `Anuncio creado: ${adName}`, `ID: ${adId}`);
                          adsSheet.getRange(a + 1, 13).setValue('CREADO');  // Columna M - Estado
                          adsSheet.getRange(a + 1, 14).setValue(adId);      // Columna N - Ad ID
                        }
                      } catch (adError) {
                        logMessage('ERROR', `Error en anuncio: ${adName}`, adError.message);
                        adsSheet.getRange(a + 1, 13).setValue('ERROR');   // Columna M - Estado
                        adsSheet.getRange(a + 1, 15).setValue(adError.message); // Columna O - Mensaje
                      }
                    }
                  }
                }
              } catch (adgroupError) {
                logMessage('ERROR', `Error en grupo: ${adgroupRow[2]}`, adgroupError.message);
                adgroupSheet.getRange(j + 1, 23).setValue('ERROR');
                adgroupSheet.getRange(j + 1, 24).setValue(adgroupError.message);
              }
            }
          }
          
          logMessage('INFO', 'Grupos procesados: 1', `Para campaña: ${campaignName}`);
        }
      } catch (error) {
        logMessage('ERROR', `Error en campaña: ${campaignName}`, error.message);
        errors++;
        campaignSheet.getRange(i + 1, 9).setValue('ERROR');
        campaignSheet.getRange(i + 1, 10).setValue(error.message);
      }
    }
    
    logMessage('INFO', 'Proceso completado', `${campaignsCreated} campañas creadas, ${errors} errores`);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `✅ Proceso completado: ${campaignsCreated} campañas creadas`,
      'Lanzamiento Finalizado',
      5
    );
    
  } catch (error) {
    logMessage('ERROR', 'Error general en lanzamiento', error.message);
    SpreadsheetApp.getUi().alert('Error', error.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ==================== FUNCIONES DE VALIDACIÓN ACTUALIZADAS ====================

/**
 * Valida todos los datos antes de lanzar con las nuevas configuraciones
 */
function validateAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  const adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS);
  const adsSheet = ss.getSheetByName(CONFIG.SHEETS.ADS);
  
  const errors = [];
  const warnings = [];
  
  // Validar credenciales
  try {
    const creds = getCredentials();
    if (!creds.APP_ID || !creds.APP_SECRET || !creds.ACCESS_TOKEN) {
      errors.push('Credenciales incompletas. Configura las credenciales primero.');
    }
  } catch (error) {
    errors.push('Error al obtener credenciales: ' + error.message);
  }
  
  // Validar campañas
  if (campaignSheet) {
    const campaigns = campaignSheet.getDataRange().getValues();
    for (let i = 1; i < campaigns.length; i++) {
      const row = campaigns[i];
      if (row[0]) { // Si está seleccionada
        if (!row[1]) errors.push(`Campaña fila ${i + 1}: Falta Advertiser ID`);
        if (!row[2]) errors.push(`Campaña fila ${i + 1}: Falta nombre de campaña`);
        if (!row[3]) errors.push(`Campaña fila ${i + 1}: Falta objetivo`);
        
        // ⭐ CAMBIO: Presupuesto de campaña ya NO es obligatorio
        if (row[4] && row[4] > 0 && row[4] < 50) {
          warnings.push(`Campaña fila ${i + 1}: Si especifica presupuesto de campaña, debe ser mínimo $50`);
        }
        if (!row[5] && row[4] > 0) {
          errors.push(`Campaña fila ${i + 1}: Si especifica presupuesto, debe indicar el modo (DAY/TOTAL)`);
        }
      }
    }
  }
  
  // Validar grupos de anuncios
  if (adgroupSheet) {
    const adgroups = adgroupSheet.getDataRange().getValues();
    for (let i = 1; i < adgroups.length; i++) {
      const row = adgroups[i];
      if (row[0] || row[2]) { // Si tiene Campaign ID o nombre
        if (!row[1]) errors.push(`AdGroup fila ${i + 1}: Falta Advertiser ID`);
        if (!row[2]) errors.push(`AdGroup fila ${i + 1}: Falta nombre del grupo`);
        
        // ⭐ CAMBIO IMPORTANTE: Presupuesto es OBLIGATORIO en AdGroup
        if (!row[14] || row[14] < 20) {
          errors.push(`AdGroup fila ${i + 1}: Presupuesto obligatorio (mínimo $20 USD)`);
        }
        
        if (!row[15]) {
          errors.push(`AdGroup fila ${i + 1}: Falta modo de presupuesto (BUDGET_MODE_DAY/BUDGET_MODE_TOTAL)`);
        }
        
        // Otras validaciones...
        if (row[3] && !row[4]) {
          errors.push(`AdGroup fila ${i + 1}: Si especificas Pixel ID, debes especificar Evento de Optimización`);
        }
        if (row[5] !== 'PLACEMENT_TIKTOK') {
          warnings.push(`AdGroup fila ${i + 1}: Se recomienda usar PLACEMENT_TIKTOK`);
        }
        if (!row[10]) errors.push(`AdGroup fila ${i + 1}: Falta países`);
      }
    }
  }
  
  // Mostrar resultados
  if (errors.length > 0 || warnings.length > 0) {
    const ui = SpreadsheetApp.getUi();
    let message = '';
    
    if (errors.length > 0) {
      message += '❌ ERRORES:\n' + errors.join('\n');
    }
    
    if (warnings.length > 0) {
      message += '\n\n⚠️ ADVERTENCIAS:\n' + warnings.join('\n');
    }
    
    ui.alert('Validación de Datos', message, ui.ButtonSet.OK);
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      '✅ Todos los datos son válidos\nPresupuesto controlado a nivel de AdGroup', 
      'Validación exitosa', 
      3
    );
  }
}

// ==================== FUNCIONES AUXILIARES ====================

/**
 * Convierte códigos de país a IDs de TikTok (SIEMPRE como strings)
 */
function getLocationIds(countryCodes) {
  if (!countryCodes) {
    logMessage('WARNING', 'No se proporcionaron códigos de país', 'Usando US por defecto');
    return ['6252001']; // String
  }
  
  const countryMap = {
    'US': '6252001',    // Estados Unidos
    'CA': '6251999',    // Canadá
    'MX': '3996063',    // México
    'BR': '3469034',    // Brasil
    'AR': '3865483',    // Argentina
    'CL': '3895114',    // Chile
    'CO': '3686110',    // Colombia
    'PE': '3932488',    // Perú
    'ES': '2510769',    // España
    'FR': '3017382',    // Francia
    'DE': '2921044',    // Alemania
    'IT': '3175395',    // Italia
    'GB': '2635167',    // Reino Unido
    'JP': '1861060',    // Japón
    'KR': '1835841',    // Corea del Sur
    'IN': '1269750',    // India
    'AU': '2077456',    // Australia
  };
  
  const codes = countryCodes.split(',').map(c => c.trim().toUpperCase());
  const locationIds = codes.map(code => {
    const id = countryMap[code];
    if (!id) {
      logMessage('WARNING', `Código de país no encontrado: ${code}`, 'Usando US por defecto');
      return '6252001'; // String
    }
    return String(id); // Asegurar que siempre sea string
  }).filter(Boolean);
  
  logMessage('DEBUG', 'Códigos de país procesados', `Input: ${countryCodes} -> Output: ${JSON.stringify(locationIds)}`);
  
  // Asegurar que todos los elementos sean strings
  return locationIds.map(id => String(id));
}

/**
 * Obtiene las credenciales desde la hoja
 */
function getCredentials() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const credSheet = ss.getSheetByName(CONFIG.SHEETS.CREDENTIALS);
    
    if (credSheet && credSheet.getLastRow() > 1) {
      const data = credSheet.getRange(2, 1, Math.min(4, credSheet.getLastRow() - 1), 2).getValues();
      const creds = {};
      
      data.forEach(row => {
        if (row[0] && row[1]) {
          creds[row[0]] = row[1];
        }
      });
      
      if (creds.ACCESS_TOKEN) {
        return creds;
      }
    }
  } catch (error) {
    console.log('Error obteniendo credenciales de la hoja:', error);
  }
  
  return {
    APP_ID: CONFIG.APP_ID,
    APP_SECRET: CONFIG.APP_SECRET,
    ACCESS_TOKEN: CONFIG.ACCESS_TOKEN
  };
}

/**
 * Realiza una llamada a la API de TikTok
 */
function makeApiCall(endpoint, method, payload, advertiserId) {
  const creds = getCredentials();
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  
  const options = {
    method: method,
    headers: {
      'Access-Token': creds.ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  try {
    console.log(`API Call: ${method} ${url}`);
    if (payload) console.log('Payload:', payload);
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    // ⭐ SIEMPRE mostrar la respuesta completa en logs
    console.log('API Response:', result);
    logMessage('DEBUG', 'API Response completa', JSON.stringify(result));
    
    if (result.code !== 0) {
      logMessage('ERROR', `API Error: ${result.message}`, `Endpoint: ${endpoint}, Code: ${result.code}`);
      
      let errorMsg = result.message || 'Error desconocido';
      
      // Agregar más detalles del error si existen
      if (result.data && result.data.error_details) {
        errorMsg += ' - Detalles: ' + JSON.stringify(result.data.error_details);
      }
      
      if (result.code === 40001) {
        errorMsg = 'Datos faltantes. Verifica que todos los campos requeridos estén completos.';
      } else if (result.code === 40002) {
        errorMsg = `Datos inválidos: ${result.message}`;
      } else if (result.code === 40100) {
        errorMsg = 'Token inválido o expirado. Genera un nuevo token.';
      } else if (result.code === 40104) {
        errorMsg = 'No tienes permisos para este advertiser.';
      }
      
      throw new Error(errorMsg);
    }
    
    return result;
    
  } catch (error) {
    logMessage('ERROR', `Error en llamada API: ${error.message}`, url);
    throw error;
  }
}

/**
 * Registra un mensaje en la hoja de logs
 */
function logMessage(type, message, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    
    if (logSheet) {
      const timestamp = new Date();
      logSheet.appendRow([timestamp, type, message, details || '']);
      
      const lastRow = logSheet.getLastRow();
      const color = type === 'ERROR' ? '#ff4444' : 
                    type === 'SUCCESS' ? '#00cc00' : '#666666';
      logSheet.getRange(lastRow, 2).setBackground(color).setFontColor('#ffffff');
    }
  } catch (error) {
    console.error('Error al escribir log:', error);
  }
}

/**
 * Muestra la ayuda actualizada del sistema
 */
function showHelp() {
  const html = HtmlService.createHtmlOutput(`
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 700px;">
      <h2>📚 Guía del Sistema TikTok Ads Manager v2.0</h2>
      
      <div style="background: #e8f5e9; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <h3>🆕 Nuevas Funcionalidades</h3>
        <ul>
          <li><strong>Conexión de Datos:</strong> Configuración de Pixel ID y eventos de optimización</li>
          <li><strong>Programación Avanzada:</strong> Control total sobre cuándo se ejecutan tus anuncios</li>
          <li><strong>Identidades Personalizadas:</strong> Define cómo aparece tu marca en los anuncios</li>
          <li><strong>Emplazamientos:</strong> Configuración automática para PLACEMENT_TIKTOK</li>
          <li><strong>Más CTAs:</strong> 20+ opciones de Call to Action</li>
        </ul>
      </div>
      
      <h3>🚀 Inicio Rápido</h3>
      <ol>
        <li><strong>Inicializar hojas:</strong> Crea todas las hojas con las nuevas columnas</li>
        <li><strong>Configurar credenciales:</strong> Ingresa tu App ID, Secret y Token</li>
        <li><strong>Cargar Advertiser IDs:</strong> Obtiene tus cuentas publicitarias</li>
        <li><strong>Cargar Pixels:</strong> Obtiene los pixels disponibles para tracking</li>
        <li><strong>Configurar Identidades:</strong> Define cómo aparecerá tu marca</li>
        <li><strong>Llenar datos:</strong> Completa la información de campañas, grupos y anuncios</li>
        <li><strong>Validar:</strong> Verifica que todos los datos sean correctos</li>
        <li><strong>Lanzar:</strong> Crea las campañas en TikTok</li>
      </ol>
      
      <h3>📊 Configuraciones Obligatorias</h3>
      
      <h4>Nivel Grupo de Anuncios:</h4>
      <ul>
        <li><strong>Pixel ID:</strong> ID del pixel para tracking (obtener de Events Manager)</li>
        <li><strong>Evento de Optimización:</strong> COMPLETE_PAYMENT, ADD_TO_CART, etc.</li>
        <li><strong>Emplazamientos:</strong> OBLIGATORIO usar PLACEMENT_TIKTOK</li>
        <li><strong>Programación:</strong> SCHEDULE_FROM_NOW o SCHEDULE_START_END</li>
        <li><strong>Segmentación:</strong> ALL_DAY para todo el día</li>
      </ul>
      
      <h4>Nivel Anuncio:</h4>
      <ul>
        <li><strong>Identidad:</strong> Nombre para mostrar (como Fan Pages de Meta)</li>
        <li><strong>Texto del Anuncio:</strong> 1-100 caracteres</li>
        <li><strong>Call to Action:</strong> SHOP_NOW, LEARN_MORE, etc.</li>
        <li><strong>URL de Destino:</strong> Landing page con tracking configurado</li>
      </ul>
      
      <h3>🎯 Eventos de Optimización</h3>
      <ul>
        <li><strong>PageView:</strong> Vista de página</li>
        <li><strong>ViewContent:</strong> Vista de contenido/producto</li>
        <li><strong>AddToCart:</strong> Agregar al carrito</li>
        <li><strong>InitiateCheckout:</strong> Iniciar checkout</li>
        <li><strong>CompletePayment:</strong> Pago completado (conversión)</li>
        <li><strong>CompleteRegistration:</strong> Registro completado</li>
        <li><strong>SubmitForm:</strong> Formulario enviado</li>
      </ul>
      
      <h3>💡 Mejores Prácticas</h3>
      <ul>
        <li>Siempre configura un Pixel antes de lanzar campañas de conversión</li>
        <li>Usa COMPLETE_PAYMENT para e-commerce</li>
        <li>Configura la identidad para mantener consistencia de marca</li>
        <li>Programa tus anuncios según el horario de tu audiencia</li>
        <li>Usa CTAs específicos según tu objetivo</li>
      </ul>
      
      <h3>🔧 Solución de Problemas</h3>
      <ul>
        <li><strong>Error "Pixel no encontrado":</strong> Ejecuta "Cargar Pixels" primero</li>
        <li><strong>Error de identidad:</strong> Configura al menos una identidad personalizada</li>
        <li><strong>Fechas inválidas:</strong> Usa formato YYYY-MM-DD HH:MM:SS</li>
        <li><strong>Placement error:</strong> Asegúrate de usar solo PLACEMENT_TIKTOK</li>
      </ul>
      
      <div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <p><strong>⚠️ Importante:</strong></p>
        <p>Este sistema usa la API real de TikTok. Las campañas creadas gastarán dinero real.</p>
        <p>Siempre verifica los datos antes de lanzar, especialmente:</p>
        <ul>
          <li>Presupuestos y pujas</li>
          <li>Pixel ID y eventos de optimización</li>
          <li>URLs de destino</li>
          <li>Fechas de programación</li>
        </ul>
      </div>
      
      <p style="text-align: center; margin-top: 20px;">
        <strong>Versión 2.0</strong> - Actualizada con configuraciones obligatorias
      </p>
    </div>
  `)
  .setWidth(800)
  .setHeight(700);
  
  SpreadsheetApp.getUi().showModalDialog(html, '📚 Ayuda - Sistema TikTok Ads v2.0');
}

// ==================== FUNCIONES EXISTENTES SIN CAMBIOS ====================

/**
 * Lanza todas las campañas
 */
function launchAllCampaigns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  
  const lastRow = campaignSheet.getLastRow();
  if (lastRow > 1) {
    const range = campaignSheet.getRange(2, 1, lastRow - 1, 1);
    const values = [];
    for (let i = 0; i < lastRow - 1; i++) {
      values.push([true]);
    }
    range.setValues(values);
  }
  
  launchSelectedCampaigns();
}

/**
 * Obtiene el estado de las campañas
 */
function getCampaignStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  const campaigns = campaignSheet.getDataRange().getValues();
  
  let updatedCount = 0;
  
  for (let i = 1; i < campaigns.length; i++) {
    const campaignId = campaigns[i][7];
    const advertiserId = campaigns[i][1];
    
    if (campaignId && advertiserId) {
      try {
        const result = makeApiCall(
          `/campaign/get/?advertiser_id=${advertiserId}&campaign_ids=${campaignId}`,
          'GET',
          null,
          advertiserId
        );
        
        if (result.data && result.data.list && result.data.list.length > 0) {
          const campaign = result.data.list[0];
          const status = campaign.status || 'UNKNOWN';
          campaignSheet.getRange(i + 1, 7).setValue(status);
          updatedCount++;
        }
      } catch (error) {
        logMessage('ERROR', `Error al obtener estado de campaña ${campaignId}`, error.message);
      }
    }
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ ${updatedCount} estados actualizados`, 
    'Actualización completada', 
    3
  );
}

/**
 * Limpia los logs
 */
function clearLogs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
  
  if (logSheet && logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 4).clearContent();
    SpreadsheetApp.getActiveSpreadsheet().toast('Logs limpiados', 'Éxito', 2);
  }
}

/**
 * Ver logs
 */
function viewLogs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
  
  if (!logSheet) {
    SpreadsheetApp.getUi().alert('No hay logs disponibles');
    return;
  }
  
  ss.setActiveSheet(logSheet);
  SpreadsheetApp.getUi().alert('📊 Logs', 
    'Se ha abierto la hoja de logs.\n\n' +
    'Los logs muestran todas las operaciones realizadas.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// Mantener las funciones existentes como testConnection, loadAdvertiserIds, etc.
// sin cambios para compatibilidad...

/**
 * Configuración manual de credenciales
 */
function setupManualCredentials() {
  const ui = SpreadsheetApp.getUi();
  
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>🔑 Configurar Credenciales TikTok</h2>
      
      <div style="background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <p><strong>ℹ️ Importante:</strong></p>
        <p>Necesitas estos datos de tu TikTok Ads Manager:</p>
        <ul>
          <li>App ID y App Secret (desde tu app en developers.tiktok.com)</li>
          <li>Access Token (generado con los permisos necesarios)</li>
          <li>Advertiser IDs (las cuentas publicitarias a gestionar)</li>
        </ul>
      </div>
      
      <p>Para configurar manualmente, edita directamente el código:</p>
      <ol>
        <li>Ve a <strong>Extensiones → Apps Script</strong></li>
        <li>Busca la constante <code>CONFIG</code> al inicio</li>
        <li>Reemplaza los valores con tus credenciales reales</li>
        <li>Guarda el archivo (Ctrl+S)</li>
        <li>Vuelve aquí y ejecuta las funciones de configuración</li>
      </ol>
      
      <div style="text-align: center; margin-top: 20px;">
        <button 
          onclick="google.script.host.close()" 
          style="background: #4285f4; color: white; padding: 10px 30px; border: none; border-radius: 5px; cursor: pointer;">
          Entendido
        </button>
      </div>
    </div>
  `;
  
  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(500)
    .setHeight(450);
  
  ui.showModalDialog(htmlOutput, 'Configuración de Credenciales');
}

/**
 * Carga los Advertiser IDs
 */
function loadAdvertiserIds() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const advertiserIds = CONFIG.KNOWN_ADVERTISER_IDS;
    
    if (!advertiserIds || advertiserIds.length === 0) {
      ui.alert('⚠️ Configuración Incompleta', 
        'Por favor, actualiza CONFIG.KNOWN_ADVERTISER_IDS con tus Advertiser IDs.',
        ui.ButtonSet.OK);
      return;
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let advertiserSheet = ss.getSheetByName(CONFIG.SHEETS.ADVERTISERS);
    
    if (!advertiserSheet) {
      advertiserSheet = ss.insertSheet(CONFIG.SHEETS.ADVERTISERS);
    }
    
    const headers = ['Advertiser ID', 'Nombre', 'Estado', 'Moneda', 'Timezone', 'Notas'];
    advertiserSheet.clear();
    advertiserSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    advertiserSheet.getRange(1, 1, 1, headers.length)
      .setBackground('#9333ea')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    
    const advertisersData = [];
    advertiserIds.forEach((id, index) => {
      advertisersData.push([
        id,
        `Cuenta ${index + 1}`,
        'ACTIVO',
        'USD',
        'America/New_York',
        'Configurado el ' + new Date().toLocaleDateString()
      ]);
    });
    
    if (advertisersData.length > 0) {
      advertiserSheet.getRange(2, 1, advertisersData.length, headers.length).setValues(advertisersData);
    }
    
    advertiserSheet.autoResizeColumns(1, headers.length);
    setupAdvertiserDropdowns(advertiserIds);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `✅ ${advertisersData.length} Advertiser IDs cargados correctamente`, 
      'Éxito', 
      5
    );
    
    logMessage('SUCCESS', 'Advertiser IDs cargados', `Total: ${advertisersData.length}`);
    
  } catch (error) {
    ui.alert('❌ Error', 
      'Error al cargar Advertiser IDs: ' + error.message,
      ui.ButtonSet.OK);
    
    logMessage('ERROR', 'Error al cargar Advertiser IDs', error.toString());
  }
}

/**
 * Configura dropdowns de Advertiser IDs
 */
function setupAdvertiserDropdowns(advertiserIds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const campaignSheet = ss.getSheetByName(CONFIG.SHEETS.CAMPAIGNS);
  
  if (!campaignSheet) return;
  
  const ids = advertiserIds || CONFIG.KNOWN_ADVERTISER_IDS;
  
  if (!ids || ids.length === 0) return;
  
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ids)
    .setAllowInvalid(false)
    .setHelpText('Selecciona un Advertiser ID de tu cuenta')
    .build();
  
  const lastRow = Math.max(campaignSheet.getLastRow(), 20);
  const range = campaignSheet.getRange(2, 2, lastRow - 1, 1);
  range.setDataValidation(rule);
  
  const adgroupSheet = ss.getSheetByName(CONFIG.SHEETS.ADGROUPS);
  if (adgroupSheet) {
    const adgroupLastRow = Math.max(adgroupSheet.getLastRow(), 20);
    adgroupSheet.getRange(2, 2, adgroupLastRow - 1, 1).setDataValidation(rule);
  }
  
  const adsSheet = ss.getSheetByName(CONFIG.SHEETS.ADS);
  if (adsSheet) {
    const adsLastRow = Math.max(adsSheet.getLastRow(), 20);
    adsSheet.getRange(2, 2, adsLastRow - 1, 1).setDataValidation(rule);
  }
}

/**
 * Valida la configuración
 */
function validateConfiguration() {
  const ui = SpreadsheetApp.getUi();
  const errors = [];
  const warnings = [];
  
  const creds = getCredentials();
  
  if (!creds.ACCESS_TOKEN || creds.ACCESS_TOKEN === 'TU_ACCESS_TOKEN_AQUI') {
    errors.push('❌ ACCESS_TOKEN no configurado');
  }
  
  if (!creds.APP_ID || creds.APP_ID === 'TU_APP_ID_AQUI') {
    warnings.push('⚠️ APP_ID no configurado');
  }
  
  if (!CONFIG.KNOWN_ADVERTISER_IDS || CONFIG.KNOWN_ADVERTISER_IDS.length === 0) {
    errors.push('❌ No hay Advertiser IDs configurados');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requiredSheets = Object.values(CONFIG.SHEETS);
  
  requiredSheets.forEach(sheetName => {
    if (!ss.getSheetByName(sheetName)) {
      warnings.push(`⚠️ Falta la hoja "${sheetName}"`);
    }
  });
  
  if (errors.length > 0) {
    ui.alert('❌ Errores de Configuración', 
      errors.join('\n') + 
      (warnings.length > 0 ? '\n\nAdvertencias:\n' + warnings.join('\n') : ''),
      ui.ButtonSet.OK);
    return false;
  } else if (warnings.length > 0) {
    const response = ui.alert('⚠️ Advertencias', 
      warnings.join('\n') + 
      '\n\n¿Deseas continuar?',
      ui.ButtonSet.YES_NO);
    return response === ui.Button.YES;
  } else {
    ui.alert('✅ Configuración Válida', 
      'Todo está correctamente configurado.\n\n' +
      `✓ Token configurado\n` +
      `✓ ${CONFIG.KNOWN_ADVERTISER_IDS.length} Advertiser IDs\n` +
      `✓ Hojas inicializadas\n` +
      `✓ Validaciones configuradas\n\n` +
      'Puedes proceder a crear campañas.',
      ui.ButtonSet.OK);
    return true;
  }
}

/**
 * Ejecuta diagnóstico del sistema
 */
function runDiagnostics() {
  const ui = SpreadsheetApp.getUi();
  const results = [];
  
  results.push('📋 VERIFICANDO CONFIGURACIÓN v2.0...');
  const creds = getCredentials();
  
  results.push(`Token: ${creds.ACCESS_TOKEN && creds.ACCESS_TOKEN !== 'TU_ACCESS_TOKEN_AQUI' ? '✅' : '❌'}`);
  results.push(`App ID: ${creds.APP_ID && creds.APP_ID !== 'TU_APP_ID_AQUI' ? '✅' : '⚠️'}`);
  results.push(`Advertiser IDs: ${CONFIG.KNOWN_ADVERTISER_IDS.length} configurados`);
  
  results.push('\n📊 VERIFICANDO HOJAS...');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = Object.values(CONFIG.SHEETS);
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    results.push(`${sheetName}: ${sheet ? '✅' : '❌ No encontrada'}`);
  });
  
  results.push('\n🔌 PROBANDO CONEXIÓN API...');
  try {
    const url = `${CONFIG.API_BASE_URL}/user/info/`;
    const options = {
      method: 'GET',
      headers: {
        'Access-Token': creds.ACCESS_TOKEN
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.code === 0) {
      results.push('Conexión API: ✅');
      results.push('Token válido: ✅');
    } else {
      results.push(`Conexión API: ❌ (${result.message})`);
    }
  } catch (error) {
    results.push(`Conexión API: ❌ (${error.message})`);
  }
  
  results.push('\n✨ NUEVAS FUNCIONALIDADES:');
  results.push('Pixel Tracking: ✅ Disponible');
  results.push('Eventos de Optimización: ✅ Configurados');
  results.push('Identidades Personalizadas: ✅ Habilitadas');
  results.push('Programación Avanzada: ✅ Lista');
  results.push('CTAs Extendidas: ✅ 20+ opciones');
  
  const diagnosticText = results.join('\n');
  
  ui.alert('🔧 Diagnóstico del Sistema v2.0', diagnosticText, ui.ButtonSet.OK);
  
  logMessage('INFO', 'Diagnóstico ejecutado', diagnosticText);
}

/**
 * Prueba la conexión
 */
function testConnection() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const creds = getCredentials();
    
    if (!creds.ACCESS_TOKEN || creds.ACCESS_TOKEN === 'TU_ACCESS_TOKEN_AQUI') {
      ui.alert('⚠️ Token no configurado', 
        'Por favor configura tu ACCESS_TOKEN primero.',
        ui.ButtonSet.OK);
      return;
    }
    
    const url = `${CONFIG.API_BASE_URL}/user/info/`;
    
    const options = {
      method: 'GET',
      headers: {
        'Access-Token': creds.ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.code === 0) {
      ui.alert('✅ Conexión Exitosa', 
        'La conexión con TikTok Ads API funciona correctamente.\n\n' +
        'Sistema v2.0 listo para usar.',
        ui.ButtonSet.OK);
      
      logMessage('SUCCESS', 'Prueba de conexión exitosa', 'Sistema v2.0');
    } else {
      ui.alert('❌ Error de API', 
        `La API respondió con error:\n${result.message}\n\n` +
        'Código: ' + result.code,
        ui.ButtonSet.OK);
    }
    
  } catch (error) {
    ui.alert('❌ Error de Conexión', 
      `Error: ${error.message}\n\n` +
      'Verifica tu configuración.',
      ui.ButtonSet.OK);
  }
}

/**
 * Actualiza el token de acceso
 */
function refreshAccessToken() {
  try {
    const creds = getCredentials();
    
    if (!creds.REFRESH_TOKEN) {
      throw new Error('No hay refresh token disponible');
    }
    
    const payload = {
      app_id: creds.APP_ID,
      secret: creds.APP_SECRET,
      refresh_token: creds.REFRESH_TOKEN
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/',
      options
    );
    
    const result = JSON.parse(response.getContentText());
    
    if (result.data && result.data.access_token) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const credSheet = ss.getSheetByName(CONFIG.SHEETS.CREDENTIALS);
      credSheet.getRange(4, 2).setValue(result.data.access_token);
      
      SpreadsheetApp.getActiveSpreadsheet().toast('✅ Token actualizado', 'Éxito', 3);
      logMessage('SUCCESS', 'Token de acceso actualizado', '');
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error al actualizar token: ' + error.message);
    logMessage('ERROR', 'Error al actualizar token', error.message);
  }
}

function logMessage(type, message, details) {
  try {
    // Log en consola
    console.log(`[${type}] ${message} ${details ? '- ' + details : ''}`);
    
    // Log en hoja
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    
    if (logSheet) {
      const timestamp = new Date();
      logSheet.appendRow([timestamp, type, message, details || '']);
      
      const lastRow = logSheet.getLastRow();
      const color = type === 'ERROR' ? '#ff4444' : 
                    type === 'SUCCESS' ? '#00cc00' : 
                    type === 'WARNING' ? '#ffaa00' :
                    type === 'DEBUG' ? '#aaaaaa' : '#666666';
      logSheet.getRange(lastRow, 2).setBackground(color).setFontColor('#ffffff');
    }
  } catch (error) {
    console.error('Error al escribir log:', error);
  }
}
function verifyPixelOwnership(pixelId, advertiserId) {
  try {
    const result = makeApiCall(
      `/pixel/list/?advertiser_id=${advertiserId}`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.pixels) {
      const pixel = result.data.pixels.find(p => 
        p.pixel_id === pixelId || p.pixel_id === String(pixelId)
      );
      
      if (pixel) {
        logMessage('INFO', `Pixel verificado: ${pixel.pixel_name} (${pixel.pixel_id})`);
        logMessage('INFO', `Eventos disponibles: ${pixel.available_events || 'No especificados'}`);
        return true;
      }
    }
    
    logMessage('ERROR', `El pixel ${pixelId} no pertenece al advertiser ${advertiserId}`);
    return false;
    
  } catch (error) {
    logMessage('ERROR', `Error verificando pixel: ${error.message}`);
    return false;
  }
}

/**
 * Lista todos los pixels disponibles para un advertiser
 */
function listAdvertiserPixels() {
  const advertiserId = '7396000534140026897'; // Tu advertiser ID
  
  try {
    // Cambiar page_size a 20 (máximo permitido)
    const result = makeApiCall(
      `/pixel/list/?advertiser_id=${advertiserId}&page_size=20`,
      'GET',
      null,
      advertiserId
    );
    
    logMessage('INFO', '=== PIXELS DISPONIBLES ===', '');
    
    if (result.data && result.data.pixels && result.data.pixels.length > 0) {
      result.data.pixels.forEach(pixel => {
        logMessage('SUCCESS', 
          `Pixel encontrado: ${pixel.pixel_name || 'Sin nombre'}`,
          `ID: ${pixel.pixel_id}, Code: ${pixel.pixel_code || 'N/A'}`
        );
        
        console.log(`Pixel: ${pixel.pixel_name} - ID: ${pixel.pixel_id} - Code: ${pixel.pixel_code}`);
        
        // Mostrar eventos disponibles si existen
        if (pixel.available_events) {
          logMessage('INFO', `Eventos disponibles para ${pixel.pixel_id}`, 
            pixel.available_events.join(', '));
        }
      });
      
      // Actualizar la hoja con los pixels encontrados
      updatePixelSheet(result.data.pixels);
      
      return result.data.pixels;
    } else {
      logMessage('WARNING', 'No se encontraron pixels para este advertiser', advertiserId);
      
      // Mensaje más detallado
      console.log('No hay pixels. Respuesta completa:', JSON.stringify(result));
      
      SpreadsheetApp.getUi().alert(
        '⚠️ Sin Pixels',
        'No se encontraron pixels para el advertiser ' + advertiserId + '\n\n' +
        'Opciones:\n' +
        '1. Crea un pixel en TikTok Ads Manager\n' +
        '2. Verifica que estés usando el advertiser correcto\n' +
        '3. Prueba con otro advertiser ID de tu lista',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      
      return [];
    }
    
  } catch (error) {
    logMessage('ERROR', 'Error listando pixels', error.message);
    return [];
  }
}

/**
 * Lista pixels para TODOS los advertisers conocidos
 */
function listAllAdvertisersPixels() {
  const allPixels = [];
  
  CONFIG.KNOWN_ADVERTISER_IDS.forEach(advertiserId => {
    logMessage('INFO', `Buscando pixels para advertiser: ${advertiserId}`, '');
    
    try {
      const result = makeApiCall(
        `/pixel/list/?advertiser_id=${advertiserId}&page_size=20`,
        'GET',
        null,
        advertiserId
      );
      
      if (result.data && result.data.pixels) {
        result.data.pixels.forEach(pixel => {
          allPixels.push({
            advertiserId: advertiserId,
            pixelId: pixel.pixel_id,
            pixelCode: pixel.pixel_code,
            pixelName: pixel.pixel_name,
            domain: pixel.domain,
            status: pixel.status
          });
          
          console.log(`[${advertiserId}] Pixel: ${pixel.pixel_name} - ID: ${pixel.pixel_id}`);
        });
      }
    } catch (error) {
      console.log(`Error con advertiser ${advertiserId}: ${error.message}`);
    }
  });
  
  // Actualizar hoja con todos los pixels
  if (allPixels.length > 0) {
    updateAllPixelsSheet(allPixels);
  } else {
    logMessage('WARNING', 'No se encontraron pixels en ningún advertiser', '');
  }
  
  return allPixels;
}

/**
 * Actualiza la hoja con todos los pixels encontrados
 */
function updateAllPixelsSheet(allPixels) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let pixelSheet = ss.getSheetByName(CONFIG.SHEETS.PIXELS);
  
  if (!pixelSheet) {
    pixelSheet = ss.insertSheet(CONFIG.SHEETS.PIXELS);
  }
  
  // Limpiar y configurar headers
  pixelSheet.clear();
  const headers = ['Advertiser ID', 'Pixel ID (Usar este)', 'Pixel Code', 'Nombre', 'Estado', 'Dominio'];
  pixelSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  pixelSheet.getRange(1, 1, 1, headers.length)
    .setBackground('#9333ea')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  
  // Agregar los pixels
  const pixelData = allPixels.map(pixel => [
    pixel.advertiserId,
    pixel.pixelId,              // ID numérico - USAR ESTE
    pixel.pixelCode || '',      // Código alfanumérico
    pixel.pixelName || 'Sin nombre',
    pixel.status || 'ACTIVO',
    pixel.domain || ''
  ]);
  
  pixelSheet.getRange(2, 1, pixelData.length, headers.length).setValues(pixelData);
  
  // Resaltar la columna importante
  pixelSheet.getRange(2, 2, pixelData.length, 1)
    .setBackground('#e8f0fe')
    .setFontWeight('bold');
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ ${allPixels.length} pixels encontrados en total`,
    'Pixels Actualizados',
    5
  );
}

function loadIdentities() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const identitySheet = ss.getSheetByName('Identidades'); // Usar el nombre exacto
  
  if (!identitySheet) {
    SpreadsheetApp.getUi().alert('Error', 'No se encontró la hoja de Identidades', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Limpiar datos existentes (mantener headers)
  const lastRow = identitySheet.getLastRow();
  if (lastRow > 1) {
    identitySheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  }
  
  const allIdentities = [];
  
  // Agregar primero la opción de usar identidad del advertiser
  allIdentities.push([
    'ADVERTISER',
    'Usar identidad del Advertiser',
    'Identidad predeterminada'
  ]);
  
  // Para cada advertiser conocido
  CONFIG.KNOWN_ADVERTISER_IDS.forEach(advertiserId => {
    try {
      const result = makeApiCall(
        `/identity/get/?advertiser_id=${advertiserId}&page_size=50`,
        'GET',
        null,
        advertiserId
      );
      
      // NOTA: La respuesta usa 'identity_list' no 'identities'
      if (result.data && result.data.identity_list) {
        result.data.identity_list.forEach(identity => {
          allIdentities.push([
            identity.identity_id,
            identity.display_name || 'Sin nombre',
            identity.profile_image || ''
          ]);
        });
      }
    } catch (error) {
      logMessage('ERROR', `Error obteniendo identidades para ${advertiserId}`, error.message);
    }
  });
  
  // Escribir las identidades en la hoja
  if (allIdentities.length > 0) {
    identitySheet.getRange(2, 1, allIdentities.length, 3).setValues(allIdentities);
    
    // Formatear
    identitySheet.getRange(2, 1, allIdentities.length, 1)
      .setBackground('#e8f5e9')
      .setFontWeight('bold');
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `✅ ${allIdentities.length} identidades cargadas`,
      'Éxito',
      3
    );
    
    console.log(`Total de identidades cargadas: ${allIdentities.length}`);
  }
}

/**
 * Crea una nueva identidad personalizada
 */
function createNewIdentity() {
  const ui = SpreadsheetApp.getUi();
  
  // Solicitar información
  const nameResponse = ui.prompt(
    'Nueva Identidad',
    'Nombre para mostrar:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
  
  const displayName = nameResponse.getResponseText();
  
  const imageResponse = ui.prompt(
    'Nueva Identidad',
    'URL de imagen de perfil (opcional, dejar vacío para omitir):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (imageResponse.getSelectedButton() !== ui.Button.OK) return;
  
  const imageUrl = imageResponse.getResponseText();
  
  // Seleccionar advertiser
  const advertiserId = CONFIG.KNOWN_ADVERTISER_IDS[0]; // O permitir selección
  
  try {
    const payload = {
      advertiser_id: advertiserId,
      display_name: displayName,
      identity_type: 'CUSTOMIZED'
    };
    
    // Si hay imagen URL, subirla primero
    if (imageUrl && imageUrl.trim()) {
      const imageId = uploadImageToTikTok(imageUrl, advertiserId, 'identity_image');
      if (imageId) {
        payload.image_uri = imageId;
      }
    }
    
    const result = makeApiCall('/identity/create/', 'POST', payload, advertiserId);
    
    if (result.data && result.data.identity_id) {
      // Agregar a la hoja
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const identitySheet = ss.getSheetByName(CONFIG.SHEETS.IDENTITIES);
      const lastRow = identitySheet.getLastRow();
      
      identitySheet.getRange(lastRow + 1, 1, 1, 3).setValues([[
        result.data.identity_id,
        displayName,
        imageUrl || ''
      ]]);
      
      ui.alert('✅ Identidad Creada', `ID: ${result.data.identity_id}`, ui.ButtonSet.OK);
      
      return result.data.identity_id;
    }
  } catch (error) {
    ui.alert('❌ Error', `No se pudo crear la identidad: ${error.message}`, ui.ButtonSet.OK);
  }
}


function listAvailableVideos() {
  const advertiserId = '7396000534140026897';
  
  try {
    const result = makeApiCall(
      `/file/video/ad/search/?advertiser_id=${advertiserId}&page_size=20`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.list) {
      logMessage('INFO', '=== VIDEOS DISPONIBLES ===');
      result.data.list.forEach(video => {
        logMessage('SUCCESS', 
          `Video: ${video.file_name || 'Sin nombre'}`,
          `ID: ${video.video_id}, Tamaño: ${video.size}, Duración: ${video.duration}s`
        );
        console.log(`Video ID: ${video.video_id} - ${video.file_name}`);
      });
      return result.data.list;
    } else {
      logMessage('WARNING', 'No se encontraron videos');
    }
  } catch (error) {
    logMessage('ERROR', 'Error obteniendo videos', error.message);
  }
}

function listAvailableImages() {
  const advertiserId = '7396000534140026897';
  
  try {
    // Endpoint correcto para buscar imágenes
    const result = makeApiCall(
      `/file/image/ad/search/?advertiser_id=${advertiserId}&page_size=20`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.list) {
      logMessage('INFO', '=== IMÁGENES DISPONIBLES ===');
      result.data.list.forEach(image => {
        logMessage('SUCCESS', 
          `Imagen: ${image.file_name || 'Sin nombre'}`,
          `ID: ${image.image_id}, Tamaño: ${image.size || 'N/A'}`
        );
        console.log(`Image ID: ${image.image_id} - ${image.file_name}`);
      });
      return result.data.list;
    } else {
      logMessage('WARNING', 'No se encontraron imágenes');
    }
  } catch (error) {
    logMessage('ERROR', 'Error obteniendo imágenes', error.message);
  }
}

function getLastUploadedImageId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Buscar Imagen Reciente',
    'Ingresa parte del nombre del archivo que subiste:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  
  const searchTerm = response.getResponseText().toLowerCase();
  const advertiserId = '7396000534140026897'; // O permitir selección
  
  try {
    const result = makeApiCall(
      `/file/image/ad/search/?advertiser_id=${advertiserId}&page_size=50`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.list) {
      const matchingImages = result.data.list.filter(img => 
        img.file_name && img.file_name.toLowerCase().includes(searchTerm)
      );
      
      if (matchingImages.length > 0) {
        // Mostrar los resultados en un diálogo
        let message = 'IMÁGENES ENCONTRADAS:\n\n';
        matchingImages.forEach(img => {
          message += `Nombre: ${img.file_name}\n`;
          message += `ID: ${img.image_id}\n`;
          message += `Tamaño: ${img.width}x${img.height}\n\n`;
        });
        
        ui.alert('IDs de Imágenes', message, ui.ButtonSet.OK);
        
        // Opcionalmente, copiar el primer ID al portapapeles
        const firstId = matchingImages[0].image_id;
        
        // Actualizar una celda específica con el ID
        const sheet = SpreadsheetApp.getActiveSheet();
        const cell = sheet.getActiveCell();
        cell.setValue(firstId);
        
      } else {
        ui.alert('No encontrado', 'No se encontraron imágenes con ese nombre', ui.ButtonSet.OK);
      }
    }
  } catch (error) {
    ui.alert('Error', error.message, ui.ButtonSet.OK);
  }
}

function uploadImageAndGetId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Subir Imagen',
    'Ingresa la URL de Google Drive de la imagen:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  
  const imageUrl = response.getResponseText();
  const advertiserId = '7396000534140026897';
  
  // Extraer ID de Google Drive
  let directUrl = imageUrl;
  if (imageUrl.includes('drive.google.com')) {
    const match = imageUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) || 
                  imageUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (match) {
      directUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  
  const payload = {
    advertiser_id: advertiserId,
    upload_type: 'UPLOAD_BY_URL',
    image_url: directUrl,
    file_name: 'img_' + Date.now()
  };
  
  try {
    const result = makeApiCall('/file/image/ad/upload/', 'POST', payload, advertiserId);
    
    if (result.data && result.data.image_id) {
      const imageId = result.data.image_id;
      
      // Mostrar y copiar el ID
      ui.alert(
        '✅ Imagen Subida',
        `ID de la imagen: ${imageId}\n\nEste ID ha sido copiado a la celda activa.`,
        ui.ButtonSet.OK
      );
      
      // Pegar en la celda activa
      const sheet = SpreadsheetApp.getActiveSheet();
      sheet.getActiveCell().setValue(imageId);
      
      return imageId;
    }
  } catch (error) {
    ui.alert('Error', `No se pudo subir: ${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * Sube un video desde una URL y obtiene su ID
 * @returns {string} El ID del video subido
 */
function uploadVideoAndGetId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Subir Video',
    'Ingresa la URL del video (Google Drive o URL directa):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  
  const videoUrl = response.getResponseText();
  const advertiserId = '7396000534140026897'; // O permitir selección
  
  // Extraer ID de Google Drive si es necesario
  let directUrl = videoUrl;
  if (videoUrl.includes('drive.google.com')) {
    const match = videoUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) || 
                  videoUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (match) {
      directUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  
  const payload = {
    advertiser_id: advertiserId,
    upload_type: 'UPLOAD_BY_URL',
    video_url: directUrl,
    file_name: 'video_' + Date.now()
  };
  
  try {
    const result = makeApiCall('/file/video/ad/upload/', 'POST', payload, advertiserId);
    
    if (result.data) {
      let videoId = null;
      let videoInfo = null;
      
      // ⭐ CORRECCIÓN: La respuesta viene en un ARRAY
      if (Array.isArray(result.data) && result.data.length > 0) {
        videoInfo = result.data[0];
        videoId = videoInfo.video_id;
      } else if (result.data.video_id) {
        // Por si acaso viene como objeto directo
        videoId = result.data.video_id;
        videoInfo = result.data;
      } else if (result.data.id) {
        videoId = result.data.id;
        videoInfo = result.data;
      }
      
      if (videoId) {
        // Información adicional del video
        let additionalInfo = '';
        if (videoInfo) {
          additionalInfo = `\n\nDetalles del video:\n`;
          additionalInfo += `- Duración: ${videoInfo.duration}s\n`;
          additionalInfo += `- Dimensiones: ${videoInfo.width}x${videoInfo.height}\n`;
          additionalInfo += `- Formato: ${videoInfo.format}\n`;
          if (videoInfo.video_cover_url) {
            additionalInfo += `- Thumbnail disponible`;
          }
        }
        
        // Mostrar y copiar el ID
        ui.alert(
          '✅ Video Subido Exitosamente',
          `ID del video: ${videoId}${additionalInfo}\n\nEste ID ha sido copiado a la celda activa.`,
          ui.ButtonSet.OK
        );
        
        // Pegar en la celda activa
        const sheet = SpreadsheetApp.getActiveSheet();
        sheet.getActiveCell().setValue(videoId);
        
        // Log de éxito con más detalles
        logMessage('SUCCESS', 
          `Video subido: ${videoInfo ? videoInfo.file_name : 'video'}`, 
          `ID: ${videoId} | Duración: ${videoInfo ? videoInfo.duration + 's' : 'N/A'}`
        );
        
        // Si hay thumbnail, ofrecer subirlo como imagen
        if (videoInfo && videoInfo.video_cover_url) {
          const uploadThumb = ui.alert(
            'Thumbnail Disponible',
            '¿Deseas subir el thumbnail del video como imagen para usar en los anuncios?',
            ui.ButtonSet.YES_NO
          );
          
          if (uploadThumb === ui.Button.YES) {
            uploadVideoThumbnail(videoInfo.video_cover_url, videoInfo.file_name || 'video');
          }
        }
        
        return videoId;
      } else {
        throw new Error('No se pudo obtener el ID del video de la respuesta');
      }
    } else {
      throw new Error('Respuesta vacía de la API');
    }
  } catch (error) {
    ui.alert('Error', `No se pudo procesar el video: ${error.message}`, ui.ButtonSet.OK);
    logMessage('ERROR', 'Error subiendo video', error.message);
  }
}

/**
 * Busca un video reciente por nombre
 * Similar a getLastUploadedImageId pero para videos
 */
function getLastUploadedVideoId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Buscar Video Reciente',
    'Ingresa parte del nombre del archivo de video que subiste:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  
  const searchTerm = response.getResponseText().toLowerCase();
  const advertiserId = '7396000534140026897'; // O permitir selección
  
  try {
    const result = makeApiCall(
      `/file/video/ad/search/?advertiser_id=${advertiserId}&page_size=50`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.list) {
      const matchingVideos = result.data.list.filter(video => 
        video.file_name && video.file_name.toLowerCase().includes(searchTerm)
      );
      
      if (matchingVideos.length > 0) {
        // Mostrar los resultados en un diálogo
        let message = 'VIDEOS ENCONTRADOS:\n\n';
        matchingVideos.forEach(video => {
          message += `Nombre: ${video.file_name}\n`;
          message += `ID: ${video.video_id || video.id}\n`;
          message += `Duración: ${video.duration}s\n`;
          message += `Tamaño: ${video.width}x${video.height}\n\n`;
        });
        
        ui.alert('IDs de Videos', message, ui.ButtonSet.OK);
        
        // Copiar el primer ID a la celda activa
        const firstId = matchingVideos[0].video_id || matchingVideos[0].id;
        
        const sheet = SpreadsheetApp.getActiveSheet();
        const cell = sheet.getActiveCell();
        cell.setValue(firstId);
        
        logMessage('SUCCESS', 'Video encontrado', `ID: ${firstId}`);
        
      } else {
        ui.alert('No encontrado', 'No se encontraron videos con ese nombre', ui.ButtonSet.OK);
      }
    }
  } catch (error) {
    ui.alert('Error', error.message, ui.ButtonSet.OK);
    logMessage('ERROR', 'Error buscando video', error.message);
  }
}

/**
 * Obtiene información detallada de un video
 * Útil para obtener la imagen thumbnail del video
 */
function getVideoInfo() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Información del Video',
    'Ingresa el ID del video:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  
  const videoId = response.getResponseText();
  const advertiserId = '7396000534140026897';
  
  try {
    const result = makeApiCall(
      `/file/video/ad/info/?advertiser_id=${advertiserId}&video_ids=["${videoId}"]`,
      'GET',
      null,
      advertiserId
    );
    
    if (result.data && result.data.list && result.data.list.length > 0) {
      const videoInfo = result.data.list[0];
      
      let message = 'INFORMACIÓN DEL VIDEO:\n\n';
      message += `ID: ${videoInfo.id}\n`;
      message += `Nombre: ${videoInfo.file_name}\n`;
      message += `Formato: ${videoInfo.format}\n`;
      message += `Duración: ${videoInfo.duration}s\n`;
      message += `Dimensiones: ${videoInfo.width}x${videoInfo.height}\n`;
      
      if (videoInfo.poster_url) {
        message += `\nURL del Thumbnail: ${videoInfo.poster_url}\n`;
        message += '\n¿Deseas subir el thumbnail como imagen?';
        
        const uploadThumb = ui.alert('Información del Video', message, ui.ButtonSet.YES_NO);
        
        if (uploadThumb === ui.Button.YES) {
          // Subir el thumbnail como imagen
          uploadVideoThumbnail(videoInfo.poster_url, videoInfo.file_name);
        }
      } else {
        ui.alert('Información del Video', message, ui.ButtonSet.OK);
      }
      
      logMessage('SUCCESS', 'Información del video obtenida', `ID: ${videoId}`);
    }
  } catch (error) {
    ui.alert('Error', error.message, ui.ButtonSet.OK);
    logMessage('ERROR', 'Error obteniendo información del video', error.message);
  }
}

/**
 * Sube el thumbnail de un video como imagen
 * @param {string} thumbnailUrl - URL del thumbnail
 * @param {string} videoName - Nombre del video original
 */
function uploadVideoThumbnail(thumbnailUrl, videoName) {
  const advertiserId = '7396000534140026897';
  
  const payload = {
    advertiser_id: advertiserId,
    upload_type: 'UPLOAD_BY_URL',
    image_url: thumbnailUrl,
    file_name: 'thumb_' + videoName.replace(/\.[^/.]+$/, "") // Quitar extensión
  };
  
  try {
    const result = makeApiCall('/file/image/ad/upload/', 'POST', payload, advertiserId);
    
    if (result.data) {
      let imageId = null;
      
      // Manejar diferentes formatos de respuesta
      if (result.data.image_id) {
        imageId = result.data.image_id;
      } else if (result.data.id) {
        imageId = result.data.id;
      } else if (Array.isArray(result.data) && result.data.length > 0) {
        imageId = result.data[0].image_id || result.data[0].id;
      }
      
      if (imageId) {
        const ui = SpreadsheetApp.getUi();
        const response = ui.alert(
          '✅ Thumbnail Subido',
          `ID del thumbnail: ${imageId}\n\n¿Deseas copiar este ID en la columna de Image IDs?`,
          ui.ButtonSet.YES_NO
        );
        
        if (response === ui.Button.YES) {
          const sheet = SpreadsheetApp.getActiveSheet();
          const cell = sheet.getActiveCell();
          // Moverse a la columna K (Image IDs) si estamos en la hoja de Anuncios
          if (sheet.getName() === CONFIG.SHEETS.ADS) {
            const row = cell.getRow();
            sheet.getRange(row, 11).setValue(imageId); // Columna K = 11
          } else {
            cell.setValue(imageId);
          }
        }
        
        logMessage('SUCCESS', 'Thumbnail subido como imagen', `ID: ${imageId}`);
        
        return imageId;
      }
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error', 
      `No se pudo subir el thumbnail: ${error.message}`, 
      SpreadsheetApp.getUi().ButtonSet.OK);
    logMessage('ERROR', 'Error subiendo thumbnail', error.message);
  }
}