# 🛠️ GUIDE DE MISE EN ROUTE — TradeLog

Suivez ces étapes dans l'ordre pour que votre site fonctionne parfaitement.

---

## ÉTAPE 1 — Créer un projet Firebase

1. Allez sur https://console.firebase.google.com
2. Cliquez **"Créer un projet"**, donnez-lui un nom (ex: `tradelog-pro`)
3. Désactivez Google Analytics si vous n'en voulez pas, puis cliquez **Continuer**

---

## ÉTAPE 2 — Activer Authentication Google

1. Dans le menu gauche : **Build > Authentication**
2. Cliquez **Commencer**
3. Dans l'onglet **"Sign-in method"**, activez **Google**
4. Choisissez un email de support projet, puis **Enregistrer**

---

## ÉTAPE 3 — Créer la base de données Firestore

1. Dans le menu gauche : **Build > Firestore Database**
2. Cliquez **Créer une base de données**
3. Choisissez **Mode production**
4. Choisissez une région (ex: `europe-west3` pour l'Europe), cliquez **Activer**

--- 

## ÉTAPE 4 — Configurer les règles Firestore

1. Dans Firestore, allez dans l'onglet **"Règles"**
2. Effacez tout le contenu existant
3. Copiez-collez **tout le contenu** du fichier `firestore.rules` (sans les commentaires `//`)
4. Cliquez **Publier**

> ⚠️ Les règles commencent par `rules_version = '2';`

---

## ÉTAPE 5 — Obtenir vos clés Firebase

1. Dans Firebase, cliquez sur l'icône ⚙️ > **Paramètres du projet**
2. Faites défiler vers **"Vos applications"**
3. Cliquez sur l'icône `</>` (Web) pour enregistrer une appli web
4. Donnez un nom (ex: `tradelog-web`), cliquez **Enregistrer l'appli**
5. Copiez le bloc `firebaseConfig` affiché (apiKey, authDomain, projectId…)

---

## ÉTAPE 6 — Remplir firebase-config.js

Ouvrez le fichier `firebase-config.js` et remplacez :

```javascript
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",        // ← coller ici
  authDomain:        "VOTRE_PROJECT.firebaseapp.com",
  projectId:         "VOTRE_PROJECT_ID",
  storageBucket:     "VOTRE_PROJECT.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId:             "VOTRE_APP_ID"
};
```

Remplacez aussi :
- `VOTRE_ADRESSE_USDT_TRC20_ICI` → votre adresse TRC20 pour recevoir les 10 USDT

---

## ÉTAPE 7 — Obtenir votre UID Admin

1. Ouvrez le site (voir Étape 8 d'abord)
2. Connectez-vous avec votre compte Google
3. Dans Firebase Console > **Authentication > Users**, copiez votre UID (colonne "User UID")
4. Dans `firebase-config.js`, remplacez :
   ```javascript
   const ADMIN_UID = "VOTRE_UID_ADMIN_ICI"; // ← coller votre UID ici
   ```
5. **Rechargez la page** — vous aurez accès à l'espace Admin

---

## ÉTAPE 8 — Héberger le site

### Option A — Firebase Hosting (recommandé, gratuit)
```bash
# Installer Firebase CLI
npm install -g firebase-tools

# Se connecter
firebase login

# Dans le dossier du projet
firebase init hosting
# → Choisissez votre projet
# → Public directory: . (point)
# → Single-page app: No
# → Overwrite index.html: No

firebase deploy
```
Votre site sera disponible sur `https://VOTRE_PROJECT.web.app`

### Option B — Hébergement simple
Uploadez tous les fichiers (`index.html`, `style.css`, `app.js`, `firebase-config.js`) sur n'importe quel hébergeur web (Netlify, Vercel, votre propre serveur…).

---

## ÉTAPE 9 — Ajouter votre domaine dans Firebase Auth

Si vous utilisez un domaine personnalisé :
1. Firebase Console > Authentication > Paramètres > Domaines autorisés
2. Ajoutez votre domaine (ex: `tradelog.votredomaine.com`)

---

## RÉSUMÉ DES FICHIERS

| Fichier | Rôle |
|---|---|
| `index.html` | Structure complète de l'application |
| `style.css` | Tous les styles (thème dark premium) |
| `firebase-config.js` | ⚠️ À configurer — vos clés Firebase |
| `app.js` | Toute la logique applicative |
| `firestore.rules` | Règles de sécurité à coller dans Firebase |
| `GUIDE.md` | Ce fichier |

---

## FONCTIONNEMENT DE L'ABONNEMENT

1. L'utilisateur s'inscrit → 14 jours d'essai gratuit
2. Après 14 jours → accès lecture seule, modification bloquée
3. L'utilisateur va dans **Abonnement**, envoie 10 USDT TRC20 sur votre wallet
4. Il soumet le hash de transaction
5. **Vous (admin)** voyez la demande dans l'espace Admin > "Demandes en attente"
6. Vous cliquez **✅ Approuver** → l'abonnement est activé pour 30 jours

---

## DÉCONNEXION AUTOMATIQUE

Un utilisateur est automatiquement déconnecté après **1 heure d'inactivité** (aucun mouvement de souris, frappe clavier, scroll ou clic).

---

## QUESTIONS FRÉQUENTES

**Q: Comment voir les trades d'un utilisateur ?**
R: Admin panel > tableau des utilisateurs, les stats P&L et nombre de trades sont affichés.

**Q: Comment modifier la durée d'essai ?**
R: Dans `firebase-config.js`, changez `const TRIAL_DAYS = 14;`

**Q: Comment modifier la durée d'abonnement ?**
R: Dans `firebase-config.js`, changez `const SUB_DAYS = 30;`

**Q: Comment modifier le délai d'inactivité ?**
R: Dans `firebase-config.js`, changez `const INACTIVITY_TIMEOUT = 60 * 60 * 1000;` (en millisecondes)
