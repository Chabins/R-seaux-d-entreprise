# Révisions — Réseaux d’entreprise

Plateforme d’entraînement construite à partir des six supports du cours (PDF à la racine du dépôt) :

1. Ethernet & couche liaison · 2. Concepts de commutation · 3. VLANs · 4. Sécurité de couche 2 · 5. Adressage IP · 6. Concepts de routage

- **252 questions** : QCM à une réponse, QCM à plusieurs réponses, **41 questions ouvertes** et de nombreuses mises en situation.
- Aucune question ne porte sur la mémorisation des commandes réseau.
- Sessions de **20 questions** tirées au hasard (≈ 13 QCM + 7 ouvertes), réparties sur les chapitres choisis ; les questions déjà vues passent après les inédites.
- Questions ouvertes corrigées par **éléments de réponse attendus** (mots-clés et synonymes, sans accents ni majuscules) ; possibilité de requalifier sa réponse dans la correction.
- Résultats : note sur 20, bonnes / mauvaises / passées, détail par chapitre, correction complète avec explication.

## Lancer en local

Aucune dépendance à installer.

```bash
npm start          # puis ouvrir http://localhost:3000
```

Ou simplement ouvrir `site/index.html` dans un navigateur (double-clic).

## Tests

```bash
npm test           # banque de questions, correction, tirage des sessions, score
npm run test:e2e   # parcours complet dans Chromium (nécessite Playwright)
```

## Structure

```
site/index.html            page unique
site/assets/questions.js   banque de questions (à compléter ici)
site/assets/quiz-core.js   tirage, correction, score
site/assets/app.js         interface
site/assets/styles.css     design (thème clair et sombre, responsive)
```

## Déploiement Vercel

`vercel.json` publie le dossier `site/` tel quel (site statique, aucune étape de build).
