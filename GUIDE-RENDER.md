# 🚀 Guide de déploiement Render — Comptes partagés partout

## ✅ Ce qui a été corrigé dans ton site

Avant, les comptes étaient enregistrés dans un **fichier SQLite local** (`ossearch.db`) qui :
- était **différent** entre ton PC et ton site Render ;
- était **effacé à chaque redéploiement** sur Render (disque éphémère) ;
- cassait carrément en mode PostgreSQL (le code avait ~40 endpoints qui utilisaient l'API SQLite même quand PostgreSQL était actif).

**Maintenant**, le serveur fonctionne **parfaitement avec PostgreSQL** (testé : 45/45 endpoints OK).
Dès que la variable `DATABASE_URL` est présente, **tous les comptes vont dans ta base PostgreSQL Render** → ils sont partagés entre ton site et n'importe quel appareil, et ils **survivent aux redéploiements**.

> Sans `DATABASE_URL`, le site retombe automatiquement sur SQLite (mode secours local). Ne rien changer d'autre : tout le reste du site est identique.

---

## 📋 Étapes sur Render (10 minutes)

### Étape 1 — Vérifie ta base PostgreSQL Render

1. Va sur https://dashboard.render.com → **Postgres**.
2. Ouvre ta base (`kz_lookup`). Si elle est **Expired/Expire bientôt** (les bases gratuites Render expirent au bout de 30 jours), crée-en une nouvelle : **New → Postgres → Free**.
3. Dans la page de la base, section **Connections**, copie la **Internal Database URL** (elle ressemble à `postgresql://user:xxxx@dpg-xxxx-a/nom_base`). C'est celle-ci qu'on utilisera sur Render.

### Étape 2 — Envoie le code sur GitHub

1. Crée un dépôt privé sur GitHub (ex: `ossearch-site`).
2. Depuis le dossier du site (ce dossier), lance :

```bash
git init
git add .
git commit -m "Comptes partagés PostgreSQL"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/ossearch-site.git
git push -u origin main
```

> Le `.gitignore` fourni exclut déjà `node_modules/`, `.env` et les fichiers `*.db`. C'est normal — Render les recréera (`npm install`) et les comptes seront dans PostgreSQL.

### Étape 3 — Crée le Web Service sur Render

1. Dashboard Render → **New → Web Service** → connecte ton dépôt GitHub.
2. Configuration :
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free (ou plus)
3. Avant de cliquer sur **Create Web Service**, ouvre **Advanced → Add Environment Variable** et ajoute AU MINIMUM :

| Clé | Valeur |
|---|---|
| `DATABASE_URL` | *(colle l'Internal Database URL de l'étape 1)* |
| `INTERNAL_BOT_KEY` | *(copie la valeur de ton fichier .env)* |
| `LOOKUP2BZ_API_KEY` | *(idem)* |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | *(idem, optionnel)* |
| `WEBHOOK_SEARCH_LOGS` … `WEBHOOK_SECURITY_LOGS` | *(copie les 5 webhooks Discord de ton .env, optionnel)* |

> ⚠️ Le port est géré automatiquement par Render (variable `PORT` déjà gérée par ton code).
> ⚠️ Ne mets JAMAIS le contenu de ton `.env` sur GitHub : les clés secrètes se mettent uniquement dans les variables d'environnement Render.

### Étape 4 — Déploie et teste

1. Clique **Create Web Service** et attends le build (2-5 min).
2. Dans les **Logs** Render tu dois voir :
   ```
   ✅ Using PostgreSQL database
   ✅ PostgreSQL tables initialized
   [📁 DB] Database loaded: X users registered.
   ```
3. Ouvre l'URL de ton site (`https://ton-service.onrender.com`) et crée un compte.
4. **Le compte est maintenant enregistré dans PostgreSQL** : il fonctionne sur tous les navigateurs/appareils et survit aux redéploiements. ✅

---

## 🔎 Vérifier que les comptes sont bien partagés

- Connecte-toi au site depuis un autre navigateur (ou ton téléphone) avec le même compte → ça marche.
- Les comptes créés **avant** cette mise à jour (dans les anciens fichiers SQLite) n'existent pas dans PostgreSQL : il faut les recréer (les anciens fichiers ne contenaient de toute façon plus rien après chaque redéploiement).

## 🛠️ Si ça ne marche pas

| Problème | Solution |
|---|---|
| Logs : `getaddrinfo ENOTFOUND dpg-...` | Ton Web Service Render n'est pas dans la **même région** que la base Postgres → recrée le service dans la bonne région, ou utilise l'**External Database URL** à la place. |
| Logs : `password authentication failed` | Re-copie l'Internal Database URL complète (elle contient le mot de passe). |
| Base Postgres « Expired » | Crée une nouvelle base Render Postgres et mets à jour `DATABASE_URL`. |
| `502` au démarrage | Regarde les logs : c'est souvent `npm install` qui rate → relance **Manual Deploy → Clear build cache & deploy**. |

## 🔒 Note sécurité (important)

Ton archive contient des clés actives (token Discord bot, secrets PayPal, webhooks). Comme elles ont transité dans un fichier partagé, **change-les** quand tu peux : régénère le token du bot Discord, les webhooks, et tes secrets PayPal. Il suffit de mettre à jour les variables d'environnement sur Render ensuite.
