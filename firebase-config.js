// ════════════════════════════════════════════════════════
//  FIREBASE CONFIG — À REMPLIR AVEC VOS INFORMATIONS
//  Copiez ces valeurs depuis : Firebase Console >
//  Paramètres du projet > Vos applications > SDK Config
// ════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyAj369C222boupw87Gba2fN4dds90EWwZE",
  authDomain: "tradelog-pro-5aac6.firebaseapp.com",
  projectId: "tradelog-pro-5aac6",
  storageBucket: "tradelog-pro-5aac6.firebasestorage.app",
  messagingSenderId: "660250447770",
  appId: "1:660250447770:web:25786549ad6975df3b3423"
};

// ════════════════════════════════════════════════════════
//  CONFIGURATION ADMIN & PAIEMENT
//  Remplacez par votre UID Firebase et votre wallet USDT
// ════════════════════════════════════════════════════════

// UID de l'administrateur (récupérez-le depuis Firebase Auth après votre 1ère connexion)
const ADMIN_UID = "bRFQlTk8OSQNCwf5S9NugcLyek42";

// Adresse USDT TRC20 pour recevoir les paiements
const USDT_WALLET = "TMT7M2dzukXgqmD5nbMXK8hhZaxR5SKVH9";

// Durée de l'essai gratuit (en jours)
const TRIAL_DAYS = 14;

// Durée de l'abonnement mensuel (en jours)
const SUB_DAYS = 30;

// Délai d'inactivité avant déconnexion automatique (en ms) — 1 heure
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;

// ════════════════════════════════════════════════════════
//  INITIALISATION FIREBASE (NE PAS MODIFIER)
// ════════════════════════════════════════════════════════
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();
