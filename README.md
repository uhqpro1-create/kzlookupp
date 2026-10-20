# OsSearch - Plateforme de Cybersécurité

Plateforme de recherche OSINT avec système d'authentification, abonnements et logs Discord.

## Déploiement sur Render

### Prérequis
- Compte Render
- Repository GitHub avec ce code

### Étapes de déploiement

1. **Configurer le repository GitHub**
   - Créer un nouveau repository sur GitHub
   - Pousser le code vers GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/VOTRE_USERNAME/ossearch.git
   git push -u origin main
   ```

2. **Configurer Render**
   - Connectez-vous sur [render.com](https://render.com)
   - Cliquez sur "New +" → "Web Service"
   - Connectez votre repository GitHub
   - Render détectera automatiquement que c'est un projet Node.js
   - Configurez:
     - **Name**: ossearch-app
     - **Region**: EU (ou la plus proche)
     - **Branch**: main
     - **Runtime**: Node (détection automatique)
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Instance Type**: Free (ou Paid si nécessaire)

3. **Configurer les variables d'environnement**
   Dans Render, allez dans la section "Environment Variables" et ajoutez:
   
   ```
   PORT=10000
   NODE_ENV=production
   BASE_URL=votre-domaine.com
   LOOKUP2BZ_API_KEY=votre_clé_api
   DISCORD_BOT_TOKEN=votre_token_bot
   DISCORD_CLIENT_ID=votre_client_id
   WEBHOOK_SEARCH_LOGS=https://ptb.discord.com/api/webhooks/1561868939888427118/DEF4jh6jiGxJ18wvpo41R6O0k9snW9g0Wfe-SaW0OFUMWDWWkKRgHcsX9yjlSGOn_FfK
   WEBHOOK_CONNECTION_LOGS=https://ptb.discord.com/api/webhooks/1561868939888427118/DEF4jh6jiGxJ18wvpo41R6O0k9snW9g0Wfe-SaW0OFUMWDWWkKRgHcsX9yjlSGOn_FfK
   WEBHOOK_ACCOUNT_STATS=https://ptb.discord.com/api/webhooks/1561868939888427118/DEF4jh6jiGxJ18wvpo41R6O0k9snW9g0Wfe-SaW0OFUMWDWWkKRgHcsX9yjlSGOn_FfK
   WEBHOOK_PAYMENT_STATS=https://ptb.discord.com/api/webhooks/1561868939888427118/DEF4jh6jiGxJ18wvpo41R6O0k9snW9g0Wfe-SaW0OFUMWDWWkKRgHcsX9yjlSGOn_FfK
   WEBHOOK_SECURITY_LOGS=https://ptb.discord.com/api/webhooks/1561868939888427118/DEF4jh6jiGxJ18wvpo41R6O0k9snW9g0Wfe-SaW0OFUMWDWWkKRgHcsX9yjlSGOn_FfK
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   INTERNAL_BOT_KEY=votre_clé_interne
   ```

4. **Configurer le disque persistant (IMPORTANT)**
   - Dans votre service Render, allez dans "Disks"
   - Cliquez "Create Disk"
   - Configurez:
     - **Name**: ossearch-data
     - **Mount Path**: /data
     - **Size**: 1 GB (minimum recommandé)
   - Le disque persistant est essentiel pour conserver la base de données SQLite entre les redéploiements

5. **Mise à jour automatique**
   - Render se met à jour automatiquement quand vous poussez sur GitHub
   - Pour vérifier: Settings → Auto-Deploy (activé par défaut)

## Base de données

La base de données SQLite est stockée dans:
- **Développement local**: `ossearch.db` (dans le dossier du projet)
- **Render**: `/data/ossearch.db` (disque persistant)

**Important**: Les fichiers de base de données locale (*.db) ne sont pas commités sur GitHub.

## Logs Discord

Le système envoie automatiquement des logs sur Discord pour:
- ✨ Nouveaux comptes créés
- 🔐 Connexions utilisateur
- 🔍 Recherches effectuées
- 💳 Paiements/Abonnements
- 🚨 Alertes de sécurité

Tous les logs sont envoyés au webhook configuré dans les variables d'environnement.

## Développement local

```bash
# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditez .env avec vos valeurs

# Démarrer le serveur
npm start

# Mode développement avec rechargement automatique
npm run dev
```

## Scripts

- `npm start` - Démarrer le serveur en production
- `npm run dev` - Démarrer avec nodemon (rechargement auto)
- `npm run bot` - Démarrer le bot Discord

## Structure du projet

```
.
├── server.js          # Serveur Express principal
├── bot.js             # Bot Discord
├── index.html         # Page principale
├── admin.html         # Panel admin
├── script.js          # Frontend JavaScript
├── styles.css         # Styles
├── admin.css          # Styles admin
├── admin.js           # Frontend admin
├── .env               # Variables d'environnement (ne pas commit)
├── .env.example       # Exemple de variables d'environnement
├── .gitignore         # Fichiers ignorés par Git
├── render.yaml        # Configuration Render
├── package.json       # Dépendances Node.js
└── ossearch.db        # Base de données SQLite (locale)
```

## Sécurité

- Rate limiting sur toutes les routes
- Détection VPN/Proxy
- Blacklist IP
- Sessions sécurisées avec tokens
- Hachage des mots de passe (PBKDF2)
- Sanitization des inputs
