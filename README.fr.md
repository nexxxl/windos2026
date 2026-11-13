# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md)

7 MB. Un système d'exploitation AI-native ultraléger de 2026 : une technologie extraterrestre au millénaire, votre usine logicielle privée aujourd'hui. Bring anything. Leave with an HTML app.

Si un système d'exploitation AI-native de 2026 s'était ouvert sur votre ordinateur au millénaire, qu'en auriez-vous fait ?

windos2026 est l'édition plugin DSH de NexlOS. Il installe un bureau complet dans DSH : 17 applications, 25 commandes, 8 langues d'interface intégrées, une archive de 7,31 MiB et une seule dépendance d'exécution. Chaque application du bureau est un `apps/<id>/index.html` plus un `app.json` : lisible, modifiable, emportable.

*Traduction. La version de référence est le README anglais.*

## Installation

Envoyez l'URL du dépôt à DSH, puis dites :

```text
https://github.com/nexxxl/windos2026
installe windos2026
```

DSH clone le dépôt et l'installe dans le profil courant avec `plugin_manager install_bundle`. Vous pouvez aussi pointer vers un répertoire local :

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

Ou installer dans le profil local sans conversation :

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Nécessite Node.js 22+ et une version de DSH capable de charger des bundles locaux. Le paquet npm n'est pas encore publié ; `npm install @nexlos/os` renvoie actuellement 404.

## Utilisation

- **Ouvrir le bureau** : après l'installation, entrez dans le bureau web. Le premier lancement passe par l'écran hello et demande une langue d'interface.
- **Une phrase, une application** : décrivez ce que vous voulez dans DSH ; il génère une application intégrée et la place sur le bureau.
- **Importer un dépôt** : donnez une URL GitHub ; il clone le dépôt, trouve le point d'entrée et l'installe comme application de bureau.
- **L'emporter** : une application n'est que des fichiers. Copiez `apps/<id>/` et elle fonctionne sur une autre machine.

## Contenu

| Élément | Nombre |
| --- | --- |
| Archive | 7,31 MiB |
| Décompressé | 11,2 MB / 260 fichiers |
| Applications | 17 |
| Commandes | 25 |
| Langues d'interface | 8 intégrées, 7 paquets optionnels |
| Thèmes | 2 (NEXL moderne / Windos2026) |
| Dépendances d'exécution | 1 (`jpeg-js`) |
| Licence | Apache-2.0 (marques et ressources tierces exclues) |

## Ce qu'il refuse de faire

- Pas de compte tiers, pas de boutique d'applications hébergée ; les applications, le code et les données restent sur votre machine.
- Aucune télémétrie.
- Aucune modification du système ; l'installateur écrit uniquement les dépendances et liens du profil DSH, et la désinstallation retire exactement cela.
- Pas de polices CJK, de binaires de l'édition universelle ni d'historique interne inclus ; rien de tout cela n'est dans ce dépôt.
- Aucune affirmation que Windows est entièrement validé ; les limites connues sont dans [Validation Windows](docs/windows-validation.md).

## Développement

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

Contrôle de taille :

```sh
./scripts/verify-lite.sh
```

## Licence

Le code et la documentation du plugin sont sous [Apache-2.0](LICENSE). Les marques ne sont pas concédées par Apache-2.0 ; les ressources tierces conservent leurs propres licences. Voir [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md) et [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
