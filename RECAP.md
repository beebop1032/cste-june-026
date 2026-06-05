# Spec — Site de collecte « Examens juin 2026 » (grève)
## Contexte
École secondaire belge en grève : les examens de juin 2026 sont revus. Pour chaque examen, il faut savoir s'il est maintenu intégralement, ou quels élèves le présentent. Un mini-site Next.js collecte les réponses des profs ; un dashboard admin pilote le tout.

##Source de données
Surveillance exam juin2026.xlsx (dans le dossier) — l'horaire officiel. Structure : feuille « Feuil1 », 6 jours (jeudi 18/06 → jeudi 25/06), chaque jour a deux plages P1/P2 ; 6 blocs horizontaux de colonnes (1re, 2e, 3e, 4e, 5e, 6e), chaque bloc = 5 colonnes : matière, groupe-classe, code prof, (vide = future colonne surveillant), local. La matière se propage vers le bas dans un bloc ; les mentions « CE1D », « CESS », « oral », « 1h » sont des annotations à concaténer à la matière courante, pas de nouvelles matières. Lignes « Réservistes » et « Lg oraux àpd … » = à ignorer.


On traite TOUS les niveaux (1re → 6e) : 326 créneaux bruts ; un même examen présent en P1 et P2 le même jour (même matière/groupe/prof/local) = un seul examen « P1+P2 » → 289 examens uniques, 54 profs (codes : ANM, DEST, IVE, JAQ…). Extraire ça dans un lib/exams.json au build.
Côté PROF

Accueil : champ code d'accès AIF2026LCK avec logo de l'école des Hayeffes de Mont-saint-guibert.

Une fois connecté :sélecteur « Votre code prof » + → puis le formulaire.
Formulaire : la liste de ses examens en cartes (matière, niveau, groupe, jour, période, local). Pour chaque examen ouvert :

saisie des noms + prénoms des élèves concernés (liste dynamique : un champ par élève, bouton « + Ajouter un élève ») — le nombre est calculé automatiquement ;
zéro élève = examen annulé ;
une case/choix : « Je surveille moi-même cet examen » (oui/non).


Examens verrouillés par l'admin (« maintenu ») : affichés grisés avec la mention « Complet », non modifiables par le prof.
Revisite / anti-espionnage : si un formulaire a déjà été soumis, toute personne qui rouvre ce prof voit « Déjà rempli » sans aucune donnée précédente affichée (ni noms, ni nombres). Modification possible, mais derrière un gros warning explicite (« Vous allez écraser les réponses existantes ») + confirmation. Objectif : empêcher les profs de consulter les réponses des autres.

Côté ADMIN
Protégé par le code AIFADMIN2026LCK (env ADMIN_KEY — différent du code profs, ne jamais les confondre). Features :

Marquer un examen « maintenu » (toggle par examen, et idéalement par lot : tout un niveau, ex. toutes les 1res/2es) → l'examen devient « Complet », bloqué côté prof. Dé-verrouillage possible.
Récap vue 1 — « comme l'Excel » : la grille type horaire avec, pour chaque examen, le nombre d'élèves (ou « Complet » / « Annulé » / « — » si pas de réponse).
Récap vue 2 — élèves : liste à plat exploitable et exportable (CSV/XLSX) : prof ; jour ; période ; niveau ; groupe ; matière ; local ; élève (nom prénom) — une ligne par élève. Plus une colonne « surveillé par le titulaire : oui/non ».
Suivi : X/54 profs ont répondu, liste des manquants.

Stack & technique (retours d'expérience de la v1)

Next.js 15 App Router (JS simple, zéro lib UI, styles inline), React 19.
Stockage : Vercel Blob si BLOB_READ_WRITE_TOKEN présent (un JSON par prof + un JSON admin-locks), sinon fallback fichiers ./data/ en local. Pas de DB.
Next 15 : params est un Promise → const { token } = await params.
Toute validation côté serveur (codes d'accès, données) ; l'API ne renvoie jamais les réponses existantes d'un prof côté formulaire (seulement un booléen « déjà rempli »).
Déploiement : repo GitHub privé → Vercel → Storage → Create Blob → env ACCESS_CODE, ADMIN_KEY → --prod.
NB : builder dans un dossier synchronisé peut échouer sur EPERM unlink .next/* — builder ailleurs ou laisser Vercel builder.

Après collecte
Export → régénération de l'horaire final : examens annulés retirés, regroupement des petits effectifs par local, attribution des surveillances (la colonne vide de l'horaire d'origine), en tenant compte des profs qui surveillent eux-mêmes.
