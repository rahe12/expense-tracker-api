const express = require('express');
const session = require('express-session');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'ussd_bmi_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 60 * 1000 } // 30 minutes
}));

// Language translations
const translations = {
  rw: {
    welcome: "Murakaza neza kuri BMI Calculator\n1. Kinyarwanda\n2. Français\n0. Gusohoka",
    enter_weight: "Injiza ibiro byawe muri kilogarama (urugero, 70):\n0. Subira inyuma",
    enter_height: "Injiza uburebure bwawe muri santimetero (urugero, 170):\n0. Subira inyuma",
    bmi_result: "BMI yawe ni %s\nIcyiciro: %s\n1. Inama z'ubuzima\n2. Ongera utangire\n0. Gusohoka",
    invalid_input: "Ibyo wanditse ntibemewe. Ongera ugerageze.\n0. Subira inyuma",
    health_tips: {
      underweight: "Inama: Fata ibiryo biryoshye, ongeramo kalori, wasanga umuganga w'imirire.\n2. Ongera utangire\n0. Gusohoka",
      normal: "Inama: Komeza kurya ibiryo biringanije, korikora imyirambere, unywe amazi ahagije.\n2. Ongera utangire\n0. Gusohoka",
      overweight: "Inama: Gukuramo kalori, ongeramo imyirambere, wasanga umuganga.\n2. Ongera utangire\n0. Gusohoka",
      obese: "Inama: Sura umuganga, tangira kurya ibiryo by'ubuzima, korikora imyirambere ufashijwe.\n2. Ongera utangire\n0. Gusohoka"
    }
  },
  fr: {
    welcome: "Bienvenue à la Calculatrice IMC\n1. Kinyarwanda\n2. Français\n0. Quitter",
    enter_weight: "Entrez votre poids en kilogrammes (ex., 70) :\n0. Retour",
    enter_height: "Entrez votre taille en centimètres (ex., 170) :\n0. Retour",
    bmi_result: "Votre IMC est %s\nCatégorie : %s\n1. Conseils de santé\n2. Recommencer\n0. Quitter",
    invalid_input: "Entrée invalide. Veuillez réessayer.\n0. Retour",
    health_tips: {
      underweight: "Conseils : Mangez des aliments riches en nutriments, augmentez l'apport calorique, consultez un diététicien.\n2. Recommencer\n0. Quitter",
      normal: "Conseils : Maintenez une alimentation équilibrée, faites de l'exercice régulièrement, restez hydraté.\n2. Recommencer\n0. Quitter",
      overweight: "Conseils : Réduisez l'apport calorique, augmentez l'activité physique, consultez un médecin.\n2. Recommencer\n0. Quitter",
      obese: "Conseils : Consultez un médecin, adoptez une alimentation saine, faites de l'exercice sous supervision.\n2. Recommencer\n0. Quitter"
    }
  }
};

app.get('/ussd', (req, res) => {
  const { ussd_text, session_id, phone_number } = req.query;
  const input = ussd_text ? ussd_text.trim() : '';
  let sessionData = req.session;

  // Initialize session if not set
  if (!sessionData.state) {
    sessionData.state = 'start';
    sessionData.language = 'rw';
    sessionData.weight = null;
    sessionData.height = null;
  }

  let response = '';
  let endSession = false;

  switch (sessionData.state) {
    case 'start':
      if (input === '1') {
        sessionData.language = 'rw';
        sessionData.state = 'weight';
        response = translations.rw.enter_weight;
      } else if (input === '2') {
        sessionData.language = 'fr';
        sessionData.state = 'weight';
        response = translations.fr.enter_weight;
      } else if (input === '0') {
        response = 'Goodbye';
        endSession = true;
      } else {
        response = translations.rw.welcome;
      }
      break;

    case 'weight':
      if (input === '0') {
        sessionData.state = 'start';
        response = translations[sessionData.language].welcome;
      } else if (!isNaN(input) && Number(input) > 0) {
        sessionData.weight = parseFloat(input);
        sessionData.state = 'height';
        response = translations[sessionData.language].enter_height;
      } else {
        response = translations[sessionData.language].invalid_input;
      }
      break;

    case 'height':
      if (input === '0') {
        sessionData.state = 'weight';
        response = translations[sessionData.language].enter_weight;
      } else if (!isNaN(input) && Number(input) > 0) {
        sessionData.height = parseFloat(input);
        // Calculate BMI
        const heightM = sessionData.height / 100;
        const bmi = (sessionData.weight / (heightM * heightM)).toFixed(1);
        // Determine category
        let category, categoryTranslated;
        if (bmi < 18.5) {
          category = 'underweight';
          categoryTranslated = sessionData.language === 'rw' ? 'Ibiro bike' : 'Insuffisance pondérale';
        } else if (bmi >= 18.5 && bmi < 25) {
          category = 'normal';
          categoryTranslated = sessionData.language === 'rw' ? 'Bisanzwe' : 'Normal';
        } else if (bmi >= 25 && bmi < 30) {
          category = 'overweight';
          categoryTranslated = sessionData.language === 'rw' ? 'Ibiro byinshi' : 'Surpoids';
        } else {
          category = 'obese';
          categoryTranslated = sessionData.language === 'rw' ? 'Umunani' : 'Obésité';
        }
        sessionData.bmi = bmi;
        sessionData.category = category;
        sessionData.state = 'result';
        response = translations[sessionData.language].bmi_result.replace('%s', bmi).replace('%s', categoryTranslated);
      } else {
        response = translations[sessionData.language].invalid_input;
      }
      break;

    case 'result':
      if (input === '1') {
        sessionData.state = 'tips';
        response = translations[sessionData.language].health_tips[sessionData.category];
      } else if (input === '2') {
        sessionData.state = 'start';
        sessionData.weight = null;
        sessionData.height = null;
        response = translations[sessionData.language].welcome;
      } else if (input === '0') {
        response = sessionData.language === 'rw' ? 'Murabeho' : 'Au revoir';
        endSession = true;
      } else {
        response = translations[sessionData.language].bmi_result.replace('%s', sessionData.bmi).replace('%s', sessionData.category);
      }
      break;

    case 'tips':
      if (input === '2') {
        sessionData.state = 'start';
        sessionData.weight = null;
        sessionData.height = null;
        response = translations[sessionData.language].welcome;
      } else if (input === '0') {
        response = sessionData.language === 'rw' ? 'Murabeho' : 'Au revoir';
        endSession = true;
      } else {
        response = translations[sessionData.language].health_tips[sessionData.category];
      }
      break;
  }

  res.set('Content-Type', 'text/plain');
  res.send(`${endSession ? 'END' : 'CON'} ${response}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`USSD app running on port ${PORT}`);
});
