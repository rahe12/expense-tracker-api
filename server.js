const http = require('http');
const querystring = require('querystring');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Your Neon database connection string
  ssl: {
    rejectUnauthorized: false
  }
});

// Database initialization
async function initializeDatabase() {
  try {
    // Create sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ussd_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        current_state VARCHAR(50) NOT NULL,
        language VARCHAR(20) DEFAULT 'french',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create BMI results table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bmi_results (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        age INTEGER,
        height DECIMAL(5,2) NOT NULL,
        weight DECIMAL(5,2) NOT NULL,
        bmi DECIMAL(4,1) NOT NULL,
        category VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES ussd_sessions(session_id)
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_phone ON ussd_sessions(phone_number);
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON ussd_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_bmi_phone ON bmi_results(phone_number);
      CREATE INDEX IF NOT EXISTS idx_bmi_session ON bmi_results(session_id);
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// Database helper functions
async function createOrUpdateSession(sessionId, phoneNumber, state, language = 'french', status = 'active') {
  try {
    const query = `
      INSERT INTO ussd_sessions (session_id, phone_number, current_state, language, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) 
      DO UPDATE SET 
        current_state = $3,
        language = $4,
        status = $5,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, phoneNumber, state, language, status]);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating/updating session:', error);
    throw error;
  }
}

async function getSession(sessionId) {
  try {
    const query = 'SELECT * FROM ussd_sessions WHERE session_id = $1';
    const result = await pool.query(query, [sessionId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting session:', error);
    throw error;
  }
}

async function saveBMIResult(sessionId, phoneNumber, age, height, weight, bmi, category) {
  try {
    const query = `
      INSERT INTO bmi_results (session_id, phone_number, age, height, weight, bmi, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, phoneNumber, age, height, weight, bmi, category]);
    return result.rows[0];
  } catch (error) {
    console.error('Error saving BMI result:', error);
    throw error;
  }
}

async function updateSessionStatus(sessionId, status) {
  try {
    const query = `
      UPDATE ussd_sessions 
      SET status = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE session_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [sessionId, status]);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating session status:', error);
    throw error;
  }
}

// Cleanup old sessions (older than 30 minutes)
async function cleanupOldSessions() {
  try {
    const query = `
      UPDATE ussd_sessions 
      SET status = 'expired' 
      WHERE updated_at < NOW() - INTERVAL '30 minutes' 
      AND status = 'active'
    `;
    
    await pool.query(query);
  } catch (error) {
    console.error('Error cleaning up old sessions:', error);
  }
}

// Constants for messages
const MESSAGES = {
  french: {
    WELCOME: "CON Bienvenue à la Calculatrice IMC / Murakaza neza kuri BMI Calculator\nVeuillez sélectionner la langue / Hitamo ururimi\n1. Français\n2. Kinyarwanda",
    ENTER_AGE: "CON Entrez votre âge (ex., 25) :\n0. Retour au menu principal\n00. Quitter\n\nChoisissez un numéro :",
    ENTER_WEIGHT: "CON Entrez votre poids en kilogrammes (ex., 70) :\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
    ENTER_HEIGHT: "CON Entrez votre taille en centimètres (ex., 170) :\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
    BMI_RESULT: "CON Votre IMC est %s\nCatégorie : %s\n1. Conseils de santé\n2. Voir historique\n0. Nouveau calcul\n00. Quitter\n\nChoisissez un numéro :",
    HEALTH_TIPS: {
      underweight: "CON Conseils : Mangez des aliments riches en nutriments, augmentez l'apport calorique, consultez un diététicien.\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
      normal: "CON Conseils : Maintenez une alimentation équilibrée, faites de l'exercice régulièrement, restez hydraté.\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
      overweight: "CON Conseils : Réduisez l'apport calorique, augmentez l'activité physique, consultez un médecin.\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
      obese: "CON Conseils : Consultez un médecin, adoptez une alimentation saine, faites de l'exercice sous supervision.\n0. Retour\n00. Quitter\n\nChoisissez un numéro :"
    },
    INVALID: "END Entrée invalide. Veuillez réessayer.",
    INVALID_CHOICE: "END Choix invalide. Veuillez réessayer.",
    ERROR: "END Le système est en maintenance. Veuillez réessayer plus tard.",
    HISTORY: "CON Historique de vos 3 derniers calculs IMC :\n%s\n0. Retour\n00. Quitter\n\nChoisissez un numéro :",
    GOODBYE: "END Merci d'avoir utilisé la Calculatrice IMC. À bientôt!",
    SESSION_ENDED: "END Session terminée. Merci!"
  },
  kinyarwanda: {
    WELCOME: "CON Bienvenue à la Calculatrice IMC / Murakaza neza kuri BMI Calculator\nVeuillez sélectionner la langue / Hitamo ururimi\n1. Français\n2. Kinyarwanda",
    ENTER_AGE: "CON Injiza imyaka yawe (urugero, 25) :\n0. Subira ku menu\n00. Sohoka\n\nHitamo nimero :",
    ENTER_WEIGHT: "CON Injiza ibiro byawe muri kilogarama (urugero, 70) :\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
    ENTER_HEIGHT: "CON Injiza uburebure bwawe muri santimetero (urugero, 170) :\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
    BMI_RESULT: "CON BMI yawe ni %s\nIcyiciro : %s\n1. Inama z'ubuzima\n2. Reba amateka\n0. Kubara ubundi\n00. Sohoka\n\nHitamo nimero :",
    HEALTH_TIPS: {
      underweight: "CON Inama : Fata ibiryo biryoshye, ongeramo kalori, wasanga umuganga w'imirire.\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
      normal: "CON Inama : Komeza kurya ibiryo biringanije, korikora imyirambere, unywe amazi ahagije.\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
      overweight: "CON Inama : Gukuramo kalori, ongeramo imyirambere, wasanga umuganga.\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
      obese: "CON Inama : Sura umuganga, tangira kurya ibiryo by'ubuzima, korikora imyirambere ufashijwe.\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :"
    },
    INVALID: "END Injiza nabi. Ongera ugerageze.",
    INVALID_CHOICE: "END Guhitamo nabi. Ongera ugerageze.",
    ERROR: "END Sisitemu iri mu bikorwa byo kuyisana. Ongera ugerageze nyuma.",
    HISTORY: "CON Amateka ya BMI yawe y'ibyashize 3 :\n%s\n0. Subira inyuma\n00. Sohoka\n\nHitamo nimero :",
    GOODBYE: "END Murakoze gukoresha BMI Calculator. Turabonana!",
    SESSION_ENDED: "END Igihe kirangiye. Murakoze!"
  }
};

// Navigation states
const STATES = {
  WELCOME: 'welcome',
  AGE: 'age',
  WEIGHT: 'weight',
  HEIGHT: 'height',
  RESULT: 'result',
  TIPS: 'tips',
  HISTORY: 'history'
};

// Session status constants
const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  TERMINATED: 'terminated',
  EXPIRED: 'expired'
};

// In-memory session storage (for temporary data during session)
const sessions = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const parsedBody = querystring.parse(body);
        const text = (parsedBody.text || '').trim();
        const sessionId = parsedBody.sessionId || Date.now().toString();
        const phoneNumber = parsedBody.phoneNumber || 'unknown';

        console.log('Received text:', text, 'Session ID:', sessionId, 'Phone:', phoneNumber);

        let response = await processUSSDFlow(text, sessionId, phoneNumber);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(response);
      } catch (error) {
        console.error('Unhandled system error:', error);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(MESSAGES.french.ERROR);
      }
    });
  } else if (req.method === 'GET' && req.url === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shutting down server...');
    console.log('Received shutdown request');
    pool.end().then(() => {
      console.log('Database connection closed');
      server.close(() => {
        console.log('Server shut down successfully');
        process.exit(0);
      });
    });
  } else {
    res.writeHead(200);
    res.end('USSD BMI Calculator service running with Neon Database.');
  }
});

function initializeSession(sessionId, phoneNumber) {
  return {
    sessionId,
    phoneNumber,
    state: STATES.WELCOME,
    language: 'french',
    age: null,
    weight: null,
    height: null,
    bmi: null,
    category: null,
    navigationStack: [],
    lastActivity: Date.now()
  };
}

function cleanupMemorySessions() {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const sid in sessions) {
    if (now - sessions[sid].lastActivity > THIRTY_MINUTES) {
      delete sessions[sid];
    }
  }
}

function pushToNavigationStack(session, state) {
  // Add current state to navigation stack before moving to new state
  if (session.state && session.state !== state) {
    session.navigationStack.push(session.state);
  }
  session.state = state;
  console.log(`Navigated to state: ${session.state}, Stack: ${JSON.stringify(session.navigationStack)}`);
}

function goBackToPreviousState(session) {
  if (session.navigationStack.length > 0) {
    // Pop the last state from the stack
    const previousState = session.navigationStack.pop();
    session.state = previousState;
    
    // Clear relevant data based on the state we're going back to
    clearDataForState(session, previousState);
    
    console.log(`Navigated back to state: ${session.state}, Stack: ${JSON.stringify(session.navigationStack)}`);
    return true;
  } else {
    // If no previous state, go to welcome
    resetToWelcome(session);
    return false;
  }
}

function clearDataForState(session, state) {
  switch (state) {
    case STATES.WELCOME:
      session.language = 'french';
      session.age = null;
      session.weight = null;
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.AGE:
      session.age = null;
      session.weight = null;
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.WEIGHT:
      session.weight = null;
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.HEIGHT:
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.RESULT:
      // Keep all data for result display
      break;
    case STATES.TIPS:
    case STATES.HISTORY:
      // No data to clear for these states
      break;
  }
}

function resetToWelcome(session) {
  session.state = STATES.WELCOME;
  session.navigationStack = [];
  session.language = 'french';
  session.age = null;
  session.weight = null;
  session.height = null;
  session.bmi = null;
  session.category = null;
  console.log(`Reset to WELCOME, Stack: ${JSON.stringify(session.navigationStack)}`);
}

function calculateBMI(weight, height) {
  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);
  
  let category;
  if (bmi < 18.5) {
    category = 'underweight';
  } else if (bmi >= 18.5 && bmi < 25) {
    category = 'normal';
  } else if (bmi >= 25 && bmi < 30) {
    category = 'overweight';
  } else {
    category = 'obese';
  }
  
  return { bmi, category };
}

function getCategoryTranslation(category, language) {
  const translations = {
    french: {
      underweight: 'Insuffisance pondérale',
      normal: 'Normal',
      overweight: 'Surpoids',
      obese: 'Obésité'
    },
    kinyarwanda: {
      underweight: 'Ibiro bike',
      normal: 'Bisanzwe',
      overweight: 'Ibiro byinshi',
      obese: 'Umunani'
    }
  };
  
  return translations[language][category];
}

async function getBMIHistory(phoneNumber, limit = 3) {
  try {
    const query = `
      SELECT bmi, category, age, height, weight, created_at 
      FROM bmi_results 
      WHERE phone_number = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await pool.query(query, [phoneNumber, limit]);
    return result.rows;
  } catch (error) {
    console.error('Error getting BMI history:', error);
    return [];
  }
}

function getStateResponse(session) {
  const lang = session.language;
  
  switch (session.state) {
    case STATES.WELCOME:
      return MESSAGES.french.WELCOME; // Always show bilingual welcome
    case STATES.AGE:
      return MESSAGES[lang].ENTER_AGE;
    case STATES.WEIGHT:
      return MESSAGES[lang].ENTER_WEIGHT;
    case STATES.HEIGHT:
      return MESSAGES[lang].ENTER_HEIGHT;
    case STATES.RESULT:
      if (session.bmi && session.category) {
        const categoryTranslated = getCategoryTranslation(session.category, lang);
        return MESSAGES[lang].BMI_RESULT.replace('%s', session.bmi).replace('%s', categoryTranslated);
      }
      break;
    case STATES.TIPS:
      if (session.category) {
        return MESSAGES[lang].HEALTH_TIPS[session.category];
      }
      break;
    case STATES.HISTORY:
      // This will be handled separately as it requires async operation
      break;
  }
  
  // Fallback to welcome if something goes wrong
  resetToWelcome(session);
  return MESSAGES.french.WELCOME;
}

async function processUSSDFlow(text, sessionId, phoneNumber) {
  try {
    // Initialize or get session from memory
    if (!sessions[sessionId]) {
      sessions[sessionId] = initializeSession(sessionId, phoneNumber);
    }
    
    const session = sessions[sessionId];
    session.lastActivity = Date.now();
    
    // Clean up old sessions
    cleanupMemorySessions();
    await cleanupOldSessions();
    
    // Parse input - extract only the last part after the last '*'
    const inputParts = text.split('*');
    const lastInput = inputParts[inputParts.length - 1];
    
    console.log(`Session ${sessionId}: State=${session.state}, Input='${lastInput}', Stack=${JSON.stringify(session.navigationStack)}`);
    
    // Handle empty input or new session
    if (!text || text === '') {
      resetToWelcome(session);
      await createOrUpdateSession(sessionId, phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
      return MESSAGES.french.WELCOME;
    }
    
    // Global exit handler - check for "00" in any state
    if (lastInput === '00') {
      await updateSessionStatus(sessionId, SESSION_STATUS.TERMINATED);
      delete sessions[sessionId];
      console.log(`Session ${sessionId} terminated by user`);
      return MESSAGES[session.language].GOODBYE;
    }
    
    // Route based on current state
    switch (session.state) {
      case STATES.WELCOME:
        return await handleWelcomeState(session, lastInput);
      
      case STATES.AGE:
        return await handleAgeState(session, lastInput);
      
      case STATES.WEIGHT:
        return await handleWeightState(session, lastInput);
      
      case STATES.HEIGHT:
        return await handleHeightState(session, lastInput);
      
      case STATES.RESULT:
        return await handleResultState(session, lastInput);
      
      case STATES.TIPS:
        return await handleTipsState(session, lastInput);
      
      case STATES.HISTORY:
        return await handleHistoryState(session, lastInput);
      
      default:
        console.error(`Unknown state: ${session.state}`);
        resetToWelcome(session);
        await createOrUpdateSession(sessionId, phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
        return MESSAGES.french.WELCOME;
    }
  } catch (error) {
    console.error('Error in processUSSDFlow:', error);
    await updateSessionStatus(sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[sessionId];
    return MESSAGES.french.ERROR;
  }
}

async function handleWelcomeState(session, input) {
  if (input === '0') {
    // Stay at WELCOME - refresh the welcome screen
    console.log('Staying at WELCOME state');
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    return MESSAGES.french.WELCOME;
  } else if (input === '1') {
    session.language = 'french';
    pushToNavigationStack(session, STATES.AGE);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Language selected: French');
    return MESSAGES.french.ENTER_AGE;
  } else if (input === '2') {
    session.language = 'kinyarwanda';
    pushToNavigationStack(session, STATES.AGE);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Language selected: Kinyarwanda');
    return MESSAGES.kinyarwanda.ENTER_AGE;
  } else {
    console.log('Invalid language selection:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES.french.INVALID;
  }
}

async function handleAgeState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBackToPreviousState(session);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Going back to main menu from age input');
    return getStateResponse(session);
  }
  
  const age = parseInt(input);
  if (!isNaN(age) && age > 0 && age <= 120) {
    session.age = age;
    pushToNavigationStack(session, STATES.WEIGHT);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Age entered:', age);
    return MESSAGES[lang].ENTER_WEIGHT;
  } else {
    console.log('Invalid age input:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID;
  }
}

async function handleWeightState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBackToPreviousState(session);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Going back from weight input');
    return getStateResponse(session);
  }
  
  const weight = parseFloat(input);
  if (!isNaN(weight) && weight > 0 && weight <= 1000) {
    session.weight = weight;
    pushToNavigationStack(session, STATES.HEIGHT);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Weight entered:', weight);
    return MESSAGES[lang].ENTER_HEIGHT;
  } else {
    console.log('Invalid weight input:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID;
  }
}

async function handleHeightState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBackToPreviousState(session);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Going back from height input');
    return getStateResponse(session);
  }
  
  const height = parseFloat(input);
  if (!isNaN(height) && height > 0 && height <= 300) {
    session.height = height;
    
    // Calculate BMI
    const { bmi, category } = calculateBMI(session.weight, session.height);
    session.bmi = bmi;
    session.category = category;
    
    // Save BMI result to database
    await saveBMIResult(
      session.sessionId, 
      session.phoneNumber, 
      session.age, 
      session.height, 
      session.weight, 
      bmi, 
      category
    );
    
    pushToNavigationStack(session, STATES.RESULT);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Height entered:', height, 'BMI:', bmi, 'Category:', category);
    
    const categoryTranslated = getCategoryTranslation(category, lang);
    return MESSAGES[lang].BMI_RESULT.replace('%s', bmi).replace('%s', categoryTranslated);
  } else {
    console.log('Invalid height input:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID;
  }
}

async function handleResultState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    // New calculation - go back to age input but clear calculation data
    session.age = null;
    session.weight = null;
    session.height = null;
    session.bmi = null;
    session.category = null;
    pushToNavigationStack(session, STATES.AGE);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Starting new calculation');
    return MESSAGES[lang].ENTER_AGE;
  } else if (input === '1') {
    pushToNavigationStack(session, STATES.TIPS);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Displaying health tips for category:', session.category);
    return MESSAGES[lang].HEALTH_TIPS[session.category];
  } else if (input === '2') {
    pushToNavigationStack(session, STATES.HISTORY);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Displaying BMI history');
    
    const history = await getBMIHistory(session.phoneNumber);
    let historyText = '';
    
    if (history.length === 0) {
      historyText = lang === 'french' ? 'Aucun historique trouvé.' : 'Nta mateka yaboneka.';
    } else {
      history.forEach((record, index) => {
        const date = new Date(record.created_at).toLocaleDateString();
        const categoryTranslated = getCategoryTranslation(record.category, lang);
        historyText += `${index + 1}. ${date}: BMI ${record.bmi} (${categoryTranslated})\n`;
      });
    }
    
    return MESSAGES[lang].HISTORY.replace('%s', historyText);
  } else {
    console.log('Invalid choice on result screen:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID_CHOICE;
  }
}

async function handleTipsState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBackToPreviousState(session);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Going back from tips screen');
    return getStateResponse(session);
  } else {
    console.log('Invalid choice on tips screen:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID_CHOICE;
  }
}

async function handleHistoryState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBackToPreviousState(session);
    await createOrUpdateSession(session.sessionId, session.phoneNumber, session.state, session.language, SESSION_STATUS.ACTIVE);
    console.log('Going back from history screen');
    return getStateResponse(session);
  } else {
    console.log('Invalid choice on history screen:', input);
    await updateSessionStatus(session.sessionId, SESSION_STATUS.TERMINATED);
    delete sessions[session.sessionId];
    return MESSAGES[lang].INVALID_CHOICE;
  }
}

// Start the server and initialize database
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database before starting server
    await initializeDatabase();
    
    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      // Set up periodic cleanup of old sessions
      setInterval(cleanupMemorySessions, 5 * 60 * 1000); // Run every 5 minutes
      setInterval(cleanupOldSessions, 5 * 60 * 1000); // Run every 5 minutes
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  
  server.close(async () => {
    try {
      await pool.end();
      console.log('Database connection closed');
      console.log('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Performing graceful shutdown...');
  
  server.close(async () => {
    try {
      await pool.end();
      console.log('Database connection closed');
      console.log('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

// Start the application
startServer();
