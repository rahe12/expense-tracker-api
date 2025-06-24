const http = require('http');
const querystring = require('querystring');

// Constants for messages
const MESSAGES = {
  french: {
    WELCOME: "CON Bienvenue à la Calculatrice IMC / Murakaza neza kuri BMI Calculator\nVeuillez sélectionner la langue / Hitamo ururimi\n1. Français\n2. Kinyarwanda",
    ENTER_WEIGHT: "CON Entrez votre poids en kilogrammes (ex., 70) :\n0. Retour\n\nChoisissez un numéro :",
    ENTER_HEIGHT: "CON Entrez votre taille en centimètres (ex., 170) :\n0. Retour\n\nChoisissez un numéro :",
    BMI_RESULT: "CON Votre IMC est %s\nCatégorie : %s\n1. Conseils de santé\n0. Retour\n\nChoisissez un numéro :",
    HEALTH_TIPS: {
      underweight: "CON Conseils : Mangez des aliments riches en nutriments, augmentez l'apport calorique, consultez un diététicien.\n0. Retour\n\nChoisissez un numéro :",
      normal: "CON Conseils : Maintenez une alimentation équilibrée, faites de l'exercice régulièrement, restez hydraté.\n0. Retour\n\nChoisissez un numéro :",
      overweight: "CON Conseils : Réduisez l'apport calorique, augmentez l'activité physique, consultez un médecin.\n0. Retour\n\nChoisissez un numéro :",
      obese: "CON Conseils : Consultez un médecin, adoptez une alimentation saine, faites de l'exercice sous supervision.\n0. Retour\n\nChoisissez un numéro :"
    },
    INVALID: "END Entrée invalide. Recomposez pour recommencer.",
    INVALID_CHOICE: "END Choix invalide. Recomposez pour recommencer.",
    ERROR: "END Le système est en maintenance. Veuillez réessayer plus tard.",
    BACK: "Retour",
    CHOOSE: "Choisissez un numéro :"
  },
  kinyarwanda: {
    WELCOME: "CON Bienvenue à la Calculatrice IMC / Murakaza neza kuri BMI Calculator\nVeuillez sélectionner la langue / Hitamo ururimi\n1. Français\n2. Kinyarwanda",
    ENTER_WEIGHT: "CON Injiza ibiro byawe muri kilogarama (urugero, 70) :\n0. Subira inyuma\n\nHitamo nimero :",
    ENTER_HEIGHT: "CON Injiza uburebure bwawe muri santimetero (urugero, 170) :\n0. Subira inyuma\n\nHitamo nimero :",
    BMI_RESULT: "CON BMI yawe ni %s\nIcyiciro : %s\n1. Inama z'ubuzima\n0. Subira inyuma\n\nHitamo nimero :",
    HEALTH_TIPS: {
      underweight: "CON Inama : Fata ibiryo biryoshye, ongeramo kalori, wasanga umuganga w'imirire.\n0. Subira inyuma\n\nHitamo nimero :",
      normal: "CON Inama : Komeza kurya ibiryo biringanije, korikora imyirambere, unywe amazi ahagije.\n0. Subira inyuma\n\nHitamo nimero :",
      overweight: "CON Inama : Gukuramo kalori, ongeramo imyirambere, wasanga umuganga.\n0. Subira inyuma\n\nHitamo nimero :",
      obese: "CON Inama : Sura umuganga, tangira kurya ibiryo by'ubuzima, korikora imyirambere ufashijwe.\n0. Subira inyuma\n\nHitamo nimero :"
    },
    INVALID: "END Injiza nabi. Kanda * ukongere utangire.",
    INVALID_CHOICE: "END Guhitamo nabi. Kanda * ukongere utangire.",
    ERROR: "END Sisitemu iri mu bikorwa byo kuyisana. Ongera ugerageze nyuma.",
    BACK: "Subira inyuma",
    CHOOSE: "Hitamo nimero :"
  }
};

// In-memory session storage
const sessions = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsedBody = querystring.parse(body);
        const text = (parsedBody.text || '').trim();
        const sessionId = parsedBody.sessionId || Date.now().toString();
        const phoneNumber = parsedBody.phoneNumber || 'unknown';
        const input = text.split('*').filter(segment => segment.match(/^\d+$/));

        console.log('Received text:', input, 'Session ID:', sessionId);

        let response = processUSSDFlow(input, sessionId);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(response);
      } catch (error) {
        console.error('Unhandled system error:', error);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(MESSAGES.french.ERROR);
      }
    });
  } else {
    res.writeHead(200);
    res.end('USSD BMI Calculator service running.');
  }
});

function processUSSDFlow(input, sessionId) {
  // Initialize session if not exists
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      state: 'welcome',
      language: 'french',
      weight: null,
      height: null,
      bmi: null,
      category: null,
      lastInputLevel: 0
    };
  }

  const session = sessions[sessionId];

  // Clean up old sessions (older than 30 minutes)
  const now = Date.now();
  for (const sid in sessions) {
    if (now - (sessions[sid].lastActivity || now) > 30 * 60 * 1000) {
      delete sessions[sid];
    }
  }
  session.lastActivity = now;

  // Empty input - show welcome screen
  if (input.length === 0) {
    console.log('Showing welcome screen');
    session.state = 'welcome';
    session.lastInputLevel = 0;
    return MESSAGES.french.WELCOME;
  }

  // First level: Language selection
  if (input.length === 1) {
    const choice = input[0];
    if (choice === '1') {
      session.language = 'french';
      session.state = 'weight';
      session.lastInputLevel = 1;
      console.log('Language selected: French');
      return MESSAGES.french.ENTER_WEIGHT;
    } else if (choice === '2') {
      session.language = 'kinyarwanda';
      session.state = 'weight';
      session.lastInputLevel = 1;
      console.log('Language selected: Kinyarwanda');
      return MESSAGES.kinyarwanda.ENTER_WEIGHT;
    } else {
      console.log('Invalid language selection:', choice);
      return MESSAGES.french.INVALID;
    }
  }

  // Second level: Weight input or back
  if (input.length === 2) {
    const lang = session.language;
    const choice = input[1];

    if (choice === '0') {
      console.log('Going back to welcome screen from weight input');
      session.state = 'welcome';
      session.lastInputLevel = 1;
      return MESSAGES.french.WELCOME;
    }

    if (!isNaN(choice) && Number(choice) > 0) {
      session.weight = parseFloat(choice);
      session.state = 'height';
      session.lastInputLevel = 2;
      console.log('Weight entered:', session.weight);
      return MESSAGES[lang].ENTER_HEIGHT;
    } else {
      console.log('Invalid weight input:', choice);
      return MESSAGES[lang].INVALID;
    }
  }

  // Third level: Height input or back
  if (input.length === 3) {
    const lang = session.language;
    const prevChoice = input[1];
    const choice = input[2];

    if (prevChoice === '0') {
      // Handle back from weight input, treat choice as language selection
      if (choice === '1') {
        session.language = 'french';
        session.state = 'weight';
        session.lastInputLevel = 2;
        console.log('Language selected after back: French');
        return MESSAGES.french.ENTER_WEIGHT;
      } else if (choice === '2') {
        session.language = 'kinyarwanda';
        session.state = 'weight';
        session.lastInputLevel = 2;
        console.log('Language selected after back: Kinyarwanda');
        return MESSAGES.kinyarwanda.ENTER_WEIGHT;
      } else {
        console.log('Invalid language selection after back:', choice);
        return MESSAGES.french.INVALID;
      }
    }

    if (choice === '0') {
      console.log('Going back to weight input from height input');
      session.state = 'weight';
      session.lastInputLevel = 2;
      return MESSAGES[lang].ENTER_WEIGHT;
    }

    if (!isNaN(choice) && Number(choice) > 0) {
      session.height = parseFloat(choice);
      // Calculate BMI
      const heightM = session.height / 100;
      const bmi = (session.weight / (heightM * heightM)).toFixed(1);
      // Determine category
      let category, categoryTranslated;
      if (bmi < 18.5) {
        category = 'underweight';
        categoryTranslated = lang === 'kinyarwanda' ? 'Ibiro bike' : 'Insuffisance pondérale';
      } else if (bmi >= 18.5 && bmi < 25) {
        category = 'normal';
        categoryTranslated = lang === 'kinyarwanda' ? 'Bisanzwe' : 'Normal';
      } else if (bmi >= 25 && bmi < 30) {
        category = 'overweight';
        categoryTranslated = lang === 'kinyarwanda' ? 'Ibiro byinshi' : 'Surpoids';
      } else {
        category = 'obese';
        categoryTranslated = lang === 'kinyarwanda' ? 'Umunani' : 'Obésité';
      }
      session.bmi = bmi;
      session.category = category;
      session.state = 'result';
      session.lastInputLevel = 3;
      console.log('Height entered:', session.height, 'BMI:', bmi, 'Category:', category);
      return MESSAGES[lang].BMI_RESULT.replace('%s', bmi).replace('%s', categoryTranslated);
    } else {
      console.log('Invalid height input:', choice);
      return MESSAGES[lang].INVALID;
    }
  }

  // Fourth level: Health tips or back
  if (input.length === 4) {
    const lang = session.language;
    const prevPrevChoice = input[1]; // Weight or back
    const prevChoice = input[2]; // Height or language
    const choice = input[3];

    // Handle back from weight input
    if (prevPrevChoice === '0') {
      // prevChoice is language, choice is weight or back
      if (prevChoice === '1' || prevChoice === '2') {
        const newLang = prevChoice === '1' ? 'french' : 'kinyarwanda';
        if (choice === '0') {
          console.log('Going back to welcome screen from weight input after back');
          session.state = 'welcome';
          session.lastInputLevel = 3;
          return MESSAGES.french.WELCOME;
        }
        if (!isNaN(choice) && Number(choice) > 0) {
          session.language = newLang;
          session.weight = parseFloat(choice);
          session.state = 'height';
          session.lastInputLevel = 3;
          console.log('Weight entered after back:', session.weight, 'Language:', newLang);
          return MESSAGES[newLang].ENTER_HEIGHT;
        } else {
          console.log('Invalid weight input after back:', choice);
          return MESSAGES[newLang].INVALID;
        }
      }
    }

    // Handle back from height input
    if (prevChoice === '0') {
      if (choice === '0') {
        console.log('Going back to welcome screen from weight input after back from height');
        session.state = 'welcome';
        session.lastInputLevel = 3;
        return MESSAGES.french.WELCOME;
      }
      if (!isNaN(choice) && Number(choice) > 0) {
        session.weight = parseFloat(choice);
        session.state = 'height';
        session.lastInputLevel = 3;
        console.log('Weight re-entered after back:', session.weight);
        return MESSAGES[lang].ENTER_HEIGHT;
      } else {
        console.log('Invalid weight input after back from height:', choice);
        return MESSAGES[lang].INVALID;
      }
    }

    // Handle result screen choices
    if (choice === '0') {
      console.log('Going back to height input from result screen');
      session.state = 'height';
      session.lastInputLevel = 3;
      return MESSAGES[lang].ENTER_HEIGHT;
    }

    if (choice === '1') {
      session.state = 'tips';
      session.lastInputLevel = 4;
      console.log('Displaying health tips for category:', session.category);
      return MESSAGES[lang].HEALTH_TIPS[session.category];
    } else {
      console.log('Invalid choice on result screen:', choice);
      return MESSAGES[lang].INVALID_CHOICE;
    }
  }

  // Fifth level: Back from health tips or language selection after multiple backs
  if (input.length === 5) {
    const lang = session.language;
    const prevPrevPrevChoice = input[1]; // Weight or back
    const prevPrevChoice = input[2]; // Height or language
    const prevChoice = input[3]; // Result screen choice or back
    const choice = input[4];

    // If state is welcome, treat choice as language selection
    if (session.state === 'welcome') {
      if (choice === '1') {
        session.language = 'french';
        session.state = 'weight';
        session.lastInputLevel = 4;
        console.log('Language selected after multiple backs: French');
        return MESSAGES.french.ENTER_WEIGHT;
      } else if (choice === '2') {
        session.language = 'kinyarwanda';
        session.state = 'weight';
        session.lastInputLevel = 4;
        console.log('Language selected after multiple backs: Kinyarwanda');
        return MESSAGES.kinyarwanda.ENTER_WEIGHT;
      } else {
        console.log('Invalid language selection after multiple backs:', choice);
        return MESSAGES.french.INVALID;
      }
    }

    // Handle back from weight input
    if (prevPrevPrevChoice === '0') {
      const newLang = prevPrevChoice === '1' ? 'french' : 'kinyarwanda';
      if (prevChoice === '0') {
        // Back from weight input after language selection
        if (choice === '0') {
          console.log('Going back to welcome screen from weight input after multiple backs');
          session.state = 'welcome';
          session.lastInputLevel = 4;
          return MESSAGES.french.WELCOME;
        }
        if (!isNaN(choice) && Number(choice) > 0) {
          session.language = newLang;
          session.weight = parseFloat(choice);
          session.state = 'height';
          session.lastInputLevel = 4;
          console.log('Weight entered after multiple backs:', session.weight);
          return MESSAGES[newLang].ENTER_HEIGHT;
        } else {
          console.log('Invalid weight input after multiple backs:', choice);
          return MESSAGES[newLang].INVALID;
        }
      }
    }

    // Handle back from height input
    if (prevPrevChoice === '0') {
      if (prevChoice === '0') {
        if (choice === '0') {
          console.log('Going back to welcome screen from weight input after back from height');
          session.state = 'welcome';
          session.lastInputLevel = 4;
          return MESSAGES.french.WELCOME;
        }
        if (!isNaN(choice) && Number(choice) > 0) {
          session.weight = parseFloat(choice);
          session.state = 'height';
          session.lastInputLevel = 4;
          console.log('Weight re-entered after back from height:', session.weight);
          return MESSAGES[lang].ENTER_HEIGHT;
        } else {
          console.log('Invalid weight input after back from height:', choice);
          return MESSAGES[lang].INVALID;
        }
      }
    }

    // Handle back from result screen
    if (prevChoice === '0') {
      if (choice === '0') {
        console.log('Going back to height input from result screen after back');
        session.state = 'height';
        session.lastInputLevel = 4;
        return MESSAGES[lang].ENTER_HEIGHT;
      } else {
        console.log('Invalid choice after back from result screen:', choice);
        return MESSAGES[lang].INVALID_CHOICE;
      }
    }

    // Handle back from tips screen
    if (choice === '0') {
      console.log('Going back to result screen from tips');
      session.state = 'result';
      session.lastInputLevel = 4;
      return MESSAGES[lang].BMI_RESULT.replace('%s', session.bmi).replace('%s', lang === 'kinyarwanda' ? 
        (session.category === 'underweight' ? 'Ibiro bike' : session.category === 'normal' ? 'Bisanzwe' : session.category === 'overweight' ? 'Ibiro byinshi' : 'Umunani') :
        (session.category === 'underweight' ? 'Insuffisance pondérale' : session.category === 'normal' ? 'Normal' : session.category === 'overweight' ? 'Surpoids' : 'Obésité'));
    } else {
      console.log('Invalid choice on tips screen:', choice);
      return MESSAGES[lang].INVALID_CHOICE;
    }
  }

  console.log('Invalid input length:', input.length);
  return MESSAGES.french.INVALID;
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ USSD BMI Calculator app is running on port ${PORT}`);
});
