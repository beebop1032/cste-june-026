# Design — Site de collecte « Examens juin 2026 »

**Date** : 2026-06-05  
**Contexte** : École secondaire belge (Les Hayeffes, Mont-Saint-Guibert) en grève. Les examens de juin 2026 sont revus. Ce mini-site Next.js collecte les réponses des profs (quels élèves passent quel examen) et offre un dashboard admin pour piloter le tout.

---

## 1. Stack technique

- **Framework** : Next.js 15 App Router, React 19, JavaScript pur (zéro lib UI), styles inline
- **Déploiement** : repo GitHub privé → Vercel → Storage → Blob
- **Stockage** : Vercel Blob si `BLOB_READ_WRITE_TOKEN` présent, sinon fallback `./data/` en local
- **Pas de base de données**

**Variables d'environnement** :

| Variable | Valeur | Usage |
|---|---|---|
| `ACCESS_CODE` | `AIF2026LCK` | Code d'accès profs |
| `ADMIN_KEY` | `AIFADMIN2026LCK` | Code d'accès admin |
| `BLOB_READ_WRITE_TOKEN` | (Vercel) | Active le stockage Blob |

**Contrainte Next.js 15** : `params` est une Promise → toujours `const { code } = await params`.

---

## 2. Source de données Excel

Le fichier `Surveillance exam juin2026.xlsx` (feuille « Feuil1 ») contient l'horaire officiel :
- 6 jours : jeudi 18/06 → jeudi 25/06
- 2 plages par jour : P1, P2
- 6 blocs horizontaux (1re à 6e), chacun sur 5 colonnes : matière, groupe-classe, code prof, (vide = futur surveillant), local
- La matière se propage vers le bas dans un bloc ; « CE1D », « CESS », « oral », « 1h » sont des annotations à concaténer à la matière courante
- Lignes « Réservistes » et « Lg oraux àpd … » → ignorées
- Un même examen en P1 et P2 le même jour (même matière/groupe/prof/local) → fusionné en « P1+P2 »
- Résultat attendu : **289 examens uniques**, **54 codes prof**

**Script de parsing** : `scripts/parse-excel.js` — tourne une seule fois en local, produit `lib/exams.json`, ce fichier est committé dans le repo. Le runtime Next.js ne lit jamais le `.xlsx`.

---

## 3. Modèle de données

### `lib/exams.json`

```json
[
  {
    "id": "ANM-MATH-2B-18-P1P2",
    "matiere": "Mathématiques",
    "niveau": "2e",
    "groupe": "2B",
    "profCode": "ANM",
    "jour": "2026-06-18",
    "periode": "P1+P2",
    "local": "S12"
  }
]
```

L'`id` est construit comme `{profCode}-{matiere_slug}-{groupe}-{jour_DD}-{periode}`.

### `prof-{CODE}.json` (réponse courante)

```json
{
  "profCode": "ANM",
  "submittedAt": "2026-06-10T14:32:00Z",
  "version": 3,
  "examens": [
    {
      "id": "ANM-MATH-2B-18-P1P2",
      "eleves": [
        { "nom": "Dupont", "prenom": "Marie" }
      ],
      "surveilleParTitulaire": true
    }
  ]
}
```

- `eleves: []` → examen annulé
- `version` : incrémenté à chaque soumission

### `admin-locks.json` (verrous courants)

```json
{
  "locked": ["ANM-MATH-2B-18-P1P2"],
  "updatedAt": "2026-06-10T15:00:00Z"
}
```

---

## 4. Stratégie de stockage sans perte de données

**Règle absolue** : aucune donnée n'est jamais écrasée sans archivage préalable.

Structure des fichiers Blob / `./data/` :

```
prof-{CODE}.json            ← réponse courante
prof-{CODE}-v{timestamp}.json  ← archive immuable avant chaque modification
admin-locks.json            ← état des verrous courant
admin-locks-v{timestamp}.json  ← archive avant chaque modification
```

**Séquence d'écriture** :
1. Lire le fichier courant
2. L'écrire en `*-v{Date.now()}.json`
3. Seulement si l'archive réussit → écrire le nouveau fichier courant
4. Si l'étape 2 échoue → exception levée, écriture annulée, donnée courante préservée

Les archives ne sont jamais supprimées automatiquement.

---

## 5. Structure des fichiers Next.js

```
app/
  page.js                    ← accueil : saisie du code d'accès
  prof/
    [code]/
      page.js                ← sélecteur de prof + formulaire
  admin/
    page.js                  ← dashboard admin
  api/
    export/
      route.js               ← GET ?format=csv|xlsx
actions/
  auth.js                    ← checkAccessCode, checkAdminKey
  prof.js                    ← getProfStatus, submitProf
  admin.js                   ← toggleLock, getRecap, getSuivi
lib/
  exams.json                 ← généré par le script, committé
  storage.js                 ← abstraction Blob / fichiers locaux
scripts/
  parse-excel.js             ← script one-shot, non utilisé au runtime
data/                        ← fallback local (gitignored sauf .gitkeep)
```

---

## 6. Flux utilisateur

### Flux prof

1. **Accueil** : saisie du code `AIF2026LCK` → cookie httpOnly signé (8h) → redirect `/prof/[code]`
2. **Sélection du code prof** : liste déroulante de tous les codes profs extraits de `exams.json`
3. **Statut** : Server Action `getProfStatus(code)` → `{ dejaRempli: boolean }` — jamais les données réelles
4. **Si déjà rempli** : bandeau orange « Déjà rempli — vous allez écraser les réponses existantes » + bouton de confirmation obligatoire avant d'afficher le formulaire
5. **Formulaire** : liste de cartes d'examens, une par examen du prof
   - Cartes verrouillées (admin) : grisées, badge « Complet », non interactives
   - Cartes ouvertes : liste dynamique élèves (nom + prénom, bouton « + Ajouter »), case « Je surveille moi-même », badge dynamique « X élève(s) — 0 = annulé »
6. **Soumission** : bouton unique « Envoyer » → Server Action `submitProf` → archive + écriture → confirmation

### Flux admin

1. **Accueil** : saisie du code `AIFADMIN2026LCK` → cookie admin séparé (httpOnly signé, 8h) → redirect `/admin`
2. **Dashboard** (Server Components, rechargé après chaque action) :
   - **Vue Horaire** : grille jours × périodes, badge par examen : `Complet` / `N élève(s)` / `Annulé` / `—`
   - **Vue Élèves** : table à plat, filtre par jour/niveau, export CSV + XLSX
   - **Vue Suivi** : X/54 profs ont répondu, liste des codes manquants
   - **Panneau verrous** : toggle par examen, boutons groupés par niveau (« Tout verrouiller — 1res », etc.), dé-verrouillage possible

---

## 7. Sécurité

- Toute validation se fait **côté serveur uniquement** (codes d'accès, format des données)
- Les Server Actions vérifient le cookie de session avant toute opération
- L'API `/api/export` vérifie le cookie admin
- L'API ne retourne **jamais** les réponses existantes d'un prof côté formulaire (seulement `{ dejaRempli: boolean }`)
- Les deux codes d'accès (`ACCESS_CODE` et `ADMIN_KEY`) ne sont jamais exposés côté client

---

## 8. Gestion des erreurs

- Si une écriture Blob échoue → exception levée, message générique à l'utilisateur, soumission non confirmée
- Si l'archivage `v{N}` échoue → écriture principale annulée (donnée courante préservée)
- Erreurs de lecture (fichier manquant) → traité comme « pas encore soumis »
- Pas de retry silencieux

---

## 9. Export

Route `GET /api/export?format=csv|xlsx` :
- Vérification cookie admin
- Agrège toutes les réponses profs (`prof-*.json` courants uniquement)
- Colonnes : prof ; jour ; période ; niveau ; groupe ; matière ; local ; nom élève ; prénom élève ; surveillé par titulaire
- Une ligne par élève
- Format CSV : `text/csv`, encodage UTF-8 avec BOM (compatible Excel)
- Format XLSX : généré avec la lib `xlsx` (SheetJS)

---

## 10. Après la collecte (hors scope de ce site)

Export → régénération de l'horaire final : examens annulés retirés, regroupement des petits effectifs par local, attribution des surveillances (colonne vide de l'horaire d'origine), en tenant compte des profs qui surveillent eux-mêmes.
